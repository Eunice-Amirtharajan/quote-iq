import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MockedProvider } from '@apollo/client/testing/react';
import { vi } from 'vitest';
import ClientsPage from './ClientsPage';
import { CLIENTS_PAGE_QUERY } from '../graphql/queries';
import { CREATE_CLIENT_MUTATION, DELETE_CLIENT_MUTATION } from '../graphql/mutations';

const CLIENT_A = { __typename: 'ClientType', id: 'c-1', name: 'Acme Corp', email: 'acme@example.com', createdAt: '2026-01-01T00:00:00.000Z' };
const CLIENT_B = { __typename: 'ClientType', id: 'c-2', name: 'Beta GmbH', email: null, createdAt: '2026-01-02T00:00:00.000Z' };

const PAGE_VARS = { search: undefined, skip: 0, take: 50 };

const clientsMock = {
  request: { query: CLIENTS_PAGE_QUERY, variables: PAGE_VARS },
  result: { data: { clientsPage: { items: [CLIENT_A, CLIENT_B], total: 2 } } },
};

const emptyMock = {
  request: { query: CLIENTS_PAGE_QUERY, variables: PAGE_VARS },
  result: { data: { clientsPage: { items: [], total: 0 } } },
};

const errorMock = {
  request: { query: CLIENTS_PAGE_QUERY, variables: PAGE_VARS },
  error: new Error('Network error'),
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderPage(mocks: any[]) {
  return render(
    <MockedProvider mocks={mocks}>
      <ClientsPage />
    </MockedProvider>,
  );
}

describe('ClientsPage', () => {
  afterEach(() => vi.clearAllMocks());

  it('renders page heading', () => {
    renderPage([emptyMock]);
    expect(screen.getByText('Clients')).toBeInTheDocument();
  });

  it('shows the client list when data loads', async () => {
    renderPage([clientsMock]);
    expect(await screen.findByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByText('Beta GmbH')).toBeInTheDocument();
    expect(screen.getByText('acme@example.com')).toBeInTheDocument();
    // null email renders as em dash
    expect(screen.getAllByText('—')).toHaveLength(1);
  });

  it('shows count in the list header', async () => {
    renderPage([clientsMock]);
    expect(await screen.findByText('2 clients')).toBeInTheDocument();
  });

  it('shows empty state when no clients', async () => {
    renderPage([emptyMock]);
    expect(await screen.findByText(/No clients yet/i)).toBeInTheDocument();
  });

  it('shows error state when query fails', async () => {
    renderPage([errorMock]);
    expect(await screen.findByText('Failed to load clients.')).toBeInTheDocument();
  });

  it('shows validation error when name is empty on submit', async () => {
    const user = userEvent.setup();
    renderPage([emptyMock]);

    await user.click(screen.getByText('Add Client'));

    expect(screen.getByText('Client name is required.')).toBeInTheDocument();
  });

  it('submits the form and clears inputs after success', async () => {
    const user = userEvent.setup();
    const newClient = { __typename: 'ClientType', id: 'c-3', name: 'New Corp', email: null, createdAt: '2026-01-03T00:00:00.000Z' };
    const createMock = {
      request: {
        query: CREATE_CLIENT_MUTATION,
        variables: { name: 'New Corp', email: undefined },
      },
      result: { data: { createClient: newClient } },
    };
    const refetchMock = {
      request: { query: CLIENTS_PAGE_QUERY, variables: { skip: 0, take: 50 } },
      result: { data: { clientsPage: { items: [CLIENT_A, CLIENT_B, newClient], total: 3 } } },
    };

    renderPage([emptyMock, createMock, refetchMock]);

    await user.type(screen.getByPlaceholderText(/Bauer Logistics/i), 'New Corp');
    await user.click(screen.getByText('Add Client'));

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Bauer Logistics/i)).toHaveValue('');
    });
  });

  it('submits with optional email', async () => {
    const user = userEvent.setup();
    const newClient = { __typename: 'ClientType', id: 'c-4', name: 'Email Corp', email: 'info@emailcorp.com', createdAt: '2026-01-04T00:00:00.000Z' };
    const createMock = {
      request: {
        query: CREATE_CLIENT_MUTATION,
        variables: { name: 'Email Corp', email: 'info@emailcorp.com' },
      },
      result: { data: { createClient: newClient } },
    };
    const refetchMock = {
      request: { query: CLIENTS_PAGE_QUERY, variables: { skip: 0, take: 50 } },
      result: { data: { clientsPage: { items: [newClient], total: 1 } } },
    };

    renderPage([emptyMock, createMock, refetchMock]);

    await user.type(screen.getByPlaceholderText(/Bauer Logistics/i), 'Email Corp');
    await user.type(screen.getByPlaceholderText(/contact@example.com/i), 'info@emailcorp.com');
    await user.click(screen.getByText('Add Client'));

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Bauer Logistics/i)).toHaveValue('');
    });
  });

  it('shows error when mutation fails', async () => {
    const user = userEvent.setup();
    const createErrorMock = {
      request: {
        query: CREATE_CLIENT_MUTATION,
        variables: { name: 'Bad Corp', email: undefined },
      },
      error: new Error('Name already exists'),
    };

    renderPage([emptyMock, createErrorMock]);

    await user.type(screen.getByPlaceholderText(/Bauer Logistics/i), 'Bad Corp');
    await user.click(screen.getByText('Add Client'));

    expect(await screen.findByText('Name already exists')).toBeInTheDocument();
  });

  it('opens delete confirmation modal and cancels', async () => {
    const user = userEvent.setup();
    renderPage([clientsMock]);
    expect(await screen.findByText('Acme Corp')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /delete acme corp/i }));
    expect(screen.getByText(/delete client\?/i)).toBeInTheDocument();
    expect(screen.getByText(/permanently remove/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^cancel$/i }));
    await waitFor(() =>
      expect(screen.queryByText(/delete client\?/i)).not.toBeInTheDocument(),
    );
  });

  it('calls delete mutation and refetches on confirm', async () => {
    const user = userEvent.setup();
    const deleteMock = {
      request: { query: DELETE_CLIENT_MUTATION, variables: { id: 'c-1' } },
      result: { data: { deleteClient: true } },
    };
    const refetchAfterDelete = {
      request: { query: CLIENTS_PAGE_QUERY, variables: PAGE_VARS },
      result: { data: { clientsPage: { items: [CLIENT_B], total: 1 } } },
    };

    renderPage([clientsMock, deleteMock, refetchAfterDelete]);
    expect(await screen.findByText('Acme Corp')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /delete acme corp/i }));
    await user.click(screen.getByRole('button', { name: /^delete$/i }));

    await waitFor(() =>
      expect(screen.queryByText('Acme Corp')).not.toBeInTheDocument(),
    );
  });

  it('shows search no-match message when search returns nothing', async () => {
    const user = userEvent.setup();
    const searchMock = {
      request: { query: CLIENTS_PAGE_QUERY, variables: { search: 'xyz', skip: 0, take: 50 } },
      result: { data: { clientsPage: { items: [], total: 0 } } },
    };

    renderPage([emptyMock, searchMock]);
    const searchInput = await screen.findByPlaceholderText(/search by name/i);
    await user.type(searchInput, 'xyz');

    expect(await screen.findByText(/no clients match your search/i)).toBeInTheDocument();
  });
});
