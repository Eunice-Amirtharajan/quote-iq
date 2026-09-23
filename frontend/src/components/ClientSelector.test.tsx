import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MockedProvider } from '@apollo/client/testing/react';
import { vi } from 'vitest';
import ClientSelector from './ClientSelector';
import { CLIENTS_QUERY } from '../graphql/queries';
import { CREATE_CLIENT_MUTATION } from '../graphql/mutations';

const CLIENT_A = { id: 'c-1', name: 'Acme Corp', email: 'acme@example.com' };
const CLIENT_B = { id: 'c-2', name: 'Beta GmbH', email: null };

// Component sends { search: undefined } when input is empty (no search term)
const clientsMock = {
  request: { query: CLIENTS_QUERY, variables: { search: undefined } },
  result: { data: { clients: [CLIENT_A, CLIENT_B] } },
};

const emptyMock = {
  request: { query: CLIENTS_QUERY, variables: { search: undefined } },
  result: { data: { clients: [] } },
};

function renderSelector(
  props: { value?: string; canCreate?: boolean },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mocks: any[] = [clientsMock],
) {
  const onChange = vi.fn();
  render(
    <MockedProvider mocks={mocks}>
      <ClientSelector value={props.value ?? ''} onChange={onChange} canCreate={props.canCreate} />
    </MockedProvider>,
  );
  return { onChange };
}

describe('ClientSelector', () => {
  afterEach(() => vi.clearAllMocks());

  it('opens dropdown on focus and shows clients', async () => {
    renderSelector({});
    const input = screen.getByRole('textbox');
    await userEvent.click(input);
    expect(await screen.findByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByText('Beta GmbH')).toBeInTheDocument();
  });

  it('selects a client on mousedown and calls onChange', async () => {
    const { onChange } = renderSelector({});
    const input = screen.getByRole('textbox');
    await userEvent.click(input);
    const option = await screen.findByText('Acme Corp');
    fireEvent.mouseDown(option);
    expect(onChange).toHaveBeenCalledWith('c-1');
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
  });

  it('filters clients by typed text', async () => {
    const betaMocks = [
      // initial load (empty search)
      { request: { query: CLIENTS_QUERY, variables: { search: undefined } }, result: { data: { clients: [CLIENT_A, CLIENT_B] } } },
      // per-keystroke server-side search queries
      { request: { query: CLIENTS_QUERY, variables: { search: 'B' } }, result: { data: { clients: [CLIENT_B] } } },
      { request: { query: CLIENTS_QUERY, variables: { search: 'Be' } }, result: { data: { clients: [CLIENT_B] } } },
      { request: { query: CLIENTS_QUERY, variables: { search: 'Bet' } }, result: { data: { clients: [CLIENT_B] } } },
      { request: { query: CLIENTS_QUERY, variables: { search: 'Beta' } }, result: { data: { clients: [CLIENT_B] } } },
    ];
    renderSelector({}, betaMocks);
    const input = screen.getByRole('textbox');
    await userEvent.type(input, 'Beta');
    await screen.findByText('Beta GmbH');
    await waitFor(() => expect(screen.queryByText('Acme Corp')).not.toBeInTheDocument());
  });

  it('closes dropdown and resets input on Escape key', async () => {
    renderSelector({});
    const input = screen.getByRole('textbox');
    await userEvent.click(input);
    await screen.findByText('Acme Corp');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
  });

  it('closes dropdown and restores name on outside click', async () => {
    renderSelector({ value: 'c-1' });
    const input = screen.getByRole('textbox');
    await userEvent.click(input);
    await screen.findByText('Acme Corp');
    await userEvent.click(document.body);
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
  });

  it('shows "Create" option when canCreate=true and no exact match', async () => {
    const newClientMocks = [
      { request: { query: CLIENTS_QUERY, variables: { search: undefined } }, result: { data: { clients: [CLIENT_A, CLIENT_B] } } },
      ...['N','Ne','New','New ','New C','New Cl','New Cli','New Clie','New Clien','New Client'].map(s => ({
        request: { query: CLIENTS_QUERY, variables: { search: s } },
        result: { data: { clients: [] } },
      })),
    ];
    renderSelector({ canCreate: true }, newClientMocks);
    const input = screen.getByRole('textbox');
    await userEvent.type(input, 'New Client');
    expect(await screen.findByText(/Create "New Client"/)).toBeInTheDocument();
  });

  it('does not show "Create" option when exact match exists', async () => {
    const acmeMocks = [
      { request: { query: CLIENTS_QUERY, variables: { search: undefined } }, result: { data: { clients: [CLIENT_A, CLIENT_B] } } },
      ...['A','Ac','Acm','Acme','Acme ','Acme C','Acme Co','Acme Cor','Acme Corp'].map(s => ({
        request: { query: CLIENTS_QUERY, variables: { search: s } },
        result: { data: { clients: [CLIENT_A] } },
      })),
    ];
    renderSelector({ canCreate: true }, acmeMocks);
    const input = screen.getByRole('textbox');
    await userEvent.type(input, 'Acme Corp');
    await screen.findByText('Acme Corp');
    expect(screen.queryByText(/Create "/)).not.toBeInTheDocument();
  });

  it('calls createClient mutation and calls onChange with new id', async () => {
    const newClient = { id: 'c-new', name: 'New Client', email: null };
    const createMock = {
      request: { query: CREATE_CLIENT_MUTATION, variables: { name: 'New Client' } },
      result: { data: { createClient: newClient } },
    };
    const refetchMock = { request: { query: CLIENTS_QUERY, variables: { search: 'New Client' } }, result: { data: { clients: [CLIENT_A, CLIENT_B, newClient] } } };
    const typingMocks = ['N','Ne','New','New ','New C','New Cl','New Cli','New Clie','New Clien','New Client'].map(s => ({
      request: { query: CLIENTS_QUERY, variables: { search: s } },
      result: { data: { clients: [] } },
    }));
    const { onChange } = renderSelector({ canCreate: true }, [emptyMock, ...typingMocks, createMock, refetchMock]);

    const input = screen.getByRole('textbox');
    await userEvent.type(input, 'New Client');
    const createOption = await screen.findByText(/Create "New Client"/);
    fireEvent.mouseDown(createOption);

    await waitFor(() => expect(onChange).toHaveBeenCalledWith('c-new'));
  });

  it('pressing Enter when showCreate triggers handleCreate', async () => {
    const newClient = { id: 'c-new', name: 'Quick Create', email: null };
    const createMock = {
      request: { query: CREATE_CLIENT_MUTATION, variables: { name: 'Quick Create' } },
      result: { data: { createClient: newClient } },
    };
    const refetchMock = { request: { query: CLIENTS_QUERY, variables: { search: 'Quick Create' } }, result: { data: { clients: [newClient] } } };
    const typingMocks = ['Q','Qu','Qui','Quic','Quick','Quick ','Quick C','Quick Cr','Quick Cre','Quick Crea','Quick Creat','Quick Create'].map(s => ({
      request: { query: CLIENTS_QUERY, variables: { search: s } },
      result: { data: { clients: [] } },
    }));
    const { onChange } = renderSelector({ canCreate: true }, [emptyMock, ...typingMocks, createMock, refetchMock]);

    const input = screen.getByRole('textbox');
    await userEvent.type(input, 'Quick Create');
    await screen.findByText(/Create "Quick Create"/);
    await userEvent.keyboard('{Enter}');

    await waitFor(() => expect(onChange).toHaveBeenCalledWith('c-new'));
  });

  it('syncs input display when value prop changes externally', async () => {
    const mock = { request: { query: CLIENTS_QUERY, variables: { search: undefined } }, result: { data: { clients: [CLIENT_A, CLIENT_B] } } };
    const { rerender } = render(
      <MockedProvider mocks={[mock]}>
        <ClientSelector value="c-1" onChange={vi.fn()} />
      </MockedProvider>,
    );
    await screen.findByDisplayValue('Acme Corp');

    rerender(
      <MockedProvider mocks={[mock]}>
        <ClientSelector value="c-2" onChange={vi.fn()} />
      </MockedProvider>,
    );
    await screen.findByDisplayValue('Beta GmbH');
  });
});
