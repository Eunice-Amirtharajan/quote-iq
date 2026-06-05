import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MockedProvider } from '@apollo/client/testing/react';
import { vi } from 'vitest';
import QuotationsPage from './QuotationsPage';
import { CLIENTS_QUERY, QUOTATIONS_QUERY } from '../graphql/queries';
import { CREATE_QUOTATION_MUTATION } from '../graphql/mutations';
import { AuthContext } from '../context/auth-context';
import type { MockLink } from '@apollo/client/testing';

const mockQuotations = [
  {
    id:              'q-1',
    quotationNumber: 'QT-2026-0001',
    title:           'Enterprise License',
    status:          'APPROVED',
    total:           7140,
    createdAt:       '2026-04-10T00:00:00.000Z',
    client: { name: 'Hans Bauer', company: 'Bauer GmbH' },
  },
  {
    id:              'q-2',
    quotationNumber: 'QT-2026-0002',
    title:           'Cloud Setup',
    status:          'SENT',
    total:           10000,
    createdAt:       '2026-04-10T00:00:00.000Z',
    client: { name: 'Emma Fischer', company: 'Fischer Tech' },
  },
];

const mockRep = {
  id: 'u-rep',
  name: 'Anna Schmidt',
  email: 'anna@quoteiq.com',
  role: 'SALES_REP' as const,
};

const mockManager = {
  id: 'u-manager',
  name: 'Marcus Klein',
  email: 'marcus@quoteiq.com',
  role: 'SALES_MANAGER' as const,
};

const mockSetUser = vi.fn();
const mockOnSelect = vi.fn();

const successMock: MockLink.MockedResponse[] = [
  {
    request: { query: QUOTATIONS_QUERY, variables: { filter: undefined } },
    result:  { data: { quotations: mockQuotations } },
  },
];

const emptyMock: MockLink.MockedResponse[] = [
  {
    request: { query: QUOTATIONS_QUERY, variables: { filter: undefined } },
    result:  { data: { quotations: [] } },
  },
];

const errorMock: MockLink.MockedResponse[] = [
  {
    request: { query: QUOTATIONS_QUERY, variables: { filter: undefined } },
    error:   new Error('Failed to fetch'),
  },
];

function renderAs(
  user: typeof mockRep | typeof mockManager,
  mocks: MockLink.MockedResponse[],
) {
  return render(
    <AuthContext.Provider value={{ user, setUser: mockSetUser }}>
      <MockedProvider mocks={mocks}>
        <QuotationsPage onSelect={mockOnSelect} />
      </MockedProvider>
    </AuthContext.Provider>,
  );
}

describe('QuotationsPage', () => {
  afterEach(() => vi.clearAllMocks());

  it('shows loading state initially with skeleton rows', () => {
    renderAs(mockRep, successMock);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('renders quotation list after loading', async () => {
    renderAs(mockRep, successMock);
    expect(await screen.findByText('Enterprise License')).toBeInTheDocument();
    expect(screen.getByText('Cloud Setup')).toBeInTheDocument();
    expect(screen.getByText('QT-2026-0001')).toBeInTheDocument();
    expect(screen.getByText('QT-2026-0002')).toBeInTheDocument();
  });

  it('renders client names and companies', async () => {
    renderAs(mockRep, successMock);
    await screen.findByText('Enterprise License');
    expect(screen.getByText('Hans Bauer')).toBeInTheDocument();
    expect(screen.getByText('Bauer GmbH')).toBeInTheDocument();
    expect(screen.getByText('Emma Fischer')).toBeInTheDocument();
  });

  it('renders status badges', async () => {
    renderAs(mockRep, successMock);
    await screen.findByText('Enterprise License');
    expect(screen.getAllByText('APPROVED').length).toBeGreaterThan(0);
    expect(screen.getAllByText('SENT').length).toBeGreaterThan(0);
  });

  it('renders totals correctly', async () => {
    renderAs(mockRep, successMock);
    await screen.findByText('Enterprise License');
    expect(screen.getByText('€7,140')).toBeInTheDocument();
    expect(screen.getByText('€10,000')).toBeInTheDocument();
  });

  it('shows total count', async () => {
    renderAs(mockRep, successMock);
    expect(await screen.findByText('2 total')).toBeInTheDocument();
  });

  it('shows empty state when no quotations', async () => {
    renderAs(mockRep, emptyMock);
    expect(await screen.findByText('No quotations yet')).toBeInTheDocument();
  });

  it('shows filter-specific empty message when filter active and no results', async () => {
    const statusMock: MockLink.MockedResponse[] = [
      {
        request: { query: QUOTATIONS_QUERY, variables: { filter: undefined } },
        result: { data: { quotations: mockQuotations } },
      },
      {
        request: { query: QUOTATIONS_QUERY, variables: { filter: { status: 'REJECTED' } } },
        result: { data: { quotations: [] } },
      },
    ];
    renderAs(mockRep, statusMock);
    await screen.findByText('Enterprise License');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'REJECTED' } });
    expect(await screen.findByText('No quotations match your filter')).toBeInTheDocument();
  });

  it('shows error state when query fails', async () => {
    renderAs(mockRep, errorMock);
    expect(
      await screen.findByText('Failed to load quotations'),
    ).toBeInTheDocument();
  });

  it('calls onSelect when row is clicked', async () => {
    renderAs(mockRep, successMock);
    await screen.findByText('Enterprise License');
    screen.getByText('Enterprise License').closest('tr')?.click();
    expect(mockOnSelect).toHaveBeenCalledWith('q-1');
  });

  it('shows New Quotation button for SALES_REP', async () => {
    renderAs(mockRep, successMock);
    await screen.findByText('Enterprise License');
    expect(screen.getByText('New Quotation')).toBeInTheDocument();
  });

  it('shows New Quotation button for SALES_MANAGER', async () => {
    renderAs(mockManager, successMock);
    await screen.findByText('Enterprise License');
    expect(screen.getByText('New Quotation')).toBeInTheDocument();
  });

  it('opens create modal when New Quotation button is clicked', async () => {
    const user = userEvent.setup();
    renderAs(mockRep, successMock);
    await screen.findByText('Enterprise License');
    await user.click(screen.getByText('New Quotation'));
    expect(screen.getByRole('dialog', { name: 'Create quotation' })).toBeInTheDocument();
  });

  it('shows Create your first quotation button in empty state', async () => {
    renderAs(mockRep, emptyMock);
    await screen.findByText('No quotations yet');
    expect(screen.getByText('Create your first quotation')).toBeInTheDocument();
  });

  it('opens modal from empty state button', async () => {
    const user = userEvent.setup();
    renderAs(mockRep, emptyMock);
    await screen.findByText('Create your first quotation');
    await user.click(screen.getByText('Create your first quotation'));
    expect(screen.getByRole('dialog', { name: 'Create quotation' })).toBeInTheDocument();
  });

  it('renders search input and status dropdown', async () => {
    renderAs(mockRep, successMock);
    await screen.findByText('Enterprise License');
    expect(screen.getByPlaceholderText('Search by title, number, or client...')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'All statuses' })).toBeInTheDocument();
  });

  it('updates search input value when changed', async () => {
    renderAs(mockRep, successMock);
    await screen.findByText('Enterprise License');
    const input = screen.getByPlaceholderText('Search by title, number, or client...');
    fireEvent.change(input, { target: { value: 'Enterprise' } });
    expect(input).toHaveValue('Enterprise');
  });

  it('updates status filter when dropdown changes', async () => {
    renderAs(mockRep, successMock);
    await screen.findByText('Enterprise License');
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'DRAFT' } });
    expect(select).toHaveValue('DRAFT');
  });

  it('refetches with status filter and shows empty state', async () => {
    const statusMock: MockLink.MockedResponse[] = [
      {
        request: { query: QUOTATIONS_QUERY, variables: { filter: undefined } },
        result: { data: { quotations: mockQuotations } },
      },
      {
        request: {
          query: QUOTATIONS_QUERY,
          variables: { filter: { status: 'DRAFT' } },
        },
        result: { data: { quotations: [] } },
      },
    ];
    renderAs(mockRep, statusMock);
    await screen.findByText('Enterprise License');

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'DRAFT' } });
    expect(await screen.findByText('No quotations match your filter')).toBeInTheDocument();
  });

  it('shows typed search text in input immediately without waiting for debounce', async () => {
    renderAs(mockRep, successMock);
    await screen.findByText('Enterprise License');

    const input = screen.getByPlaceholderText('Search by title, number, or client...');
    fireEvent.change(input, { target: { value: 'Cloud' } });
    expect(input).toHaveValue('Cloud');
    // List still shows full results — debounce has not fired yet
    expect(screen.getByText('Enterprise License')).toBeInTheDocument();
  });

  it('shows clear button when search has text and clears on click', async () => {
    const user = userEvent.setup();
    renderAs(mockRep, successMock);
    await screen.findByText('Enterprise License');

    const input = screen.getByPlaceholderText('Search by title, number, or client...');
    fireEvent.change(input, { target: { value: 'Cloud' } });
    const clearBtn = screen.getByRole('button', { name: 'Clear search' });
    expect(clearBtn).toBeInTheDocument();

    await user.click(clearBtn);
    expect(input).toHaveValue('');
    expect(screen.queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument();
  });

  it('clears previous debounce timer when search changes again', async () => {
    renderAs(mockRep, successMock);
    await screen.findByText('Enterprise License');

    const input = screen.getByPlaceholderText('Search by title, number, or client...');
    // first change sets a timer; second change clears it and sets a new one
    fireEvent.change(input, { target: { value: 'Ent' } });
    fireEvent.change(input, { target: { value: 'Enterprise' } });
    expect(input).toHaveValue('Enterprise');
    // full list still visible — debounce not yet fired, query unchanged
    expect(screen.getByText('Enterprise License')).toBeInTheDocument();
  });

  it('closes modal and calls onSelect after successful quotation creation', async () => {
    const user = userEvent.setup();
    const newQuotation = {
      id: 'q-new',
      quotationNumber: 'QT-2026-0099',
      title: 'New Deal',
      status: 'DRAFT',
      total: 0,
      createdAt: new Date().toISOString(),
      client: { name: 'Hans Bauer', company: 'Bauer GmbH' },
    };
    const mocks: MockLink.MockedResponse[] = [
      { request: { query: QUOTATIONS_QUERY, variables: { filter: undefined } }, result: { data: { quotations: mockQuotations } } },
      { request: { query: CLIENTS_QUERY }, result: { data: { clients: [{ id: 'c-1', name: 'Hans Bauer', company: 'Bauer GmbH' }] } } },
      {
        request: {
          query: CREATE_QUOTATION_MUTATION,
          variables: { input: { title: 'New Deal', clientId: 'c-1', notes: undefined, taxRate: 0, items: [{ description: 'Consulting', quantity: 1, unitPrice: 500 }] } },
        },
        result: { data: { createQuotation: newQuotation } },
      },
      { request: { query: QUOTATIONS_QUERY, variables: { filter: undefined } }, result: { data: { quotations: [...mockQuotations, newQuotation] } } },
    ];

    renderAs(mockRep, mocks);
    await screen.findByText('Enterprise License');

    await user.click(screen.getByText('New Quotation'));
    expect(screen.getByRole('dialog', { name: 'Create quotation' })).toBeInTheDocument();

    await screen.findByRole('option', { name: /Hans Bauer/i });
    await user.type(screen.getByPlaceholderText(/Software Development/i), 'New Deal');
    await user.selectOptions(screen.getByRole('dialog').querySelector('select')!, 'c-1');
    await user.type(screen.getAllByPlaceholderText('Description')[0], 'Consulting');
    const priceInputs = screen.getAllByPlaceholderText('0.00');
    await user.type(priceInputs[0], '500');

    await user.click(screen.getByText('Create Quotation'));

    await waitFor(() => {
      expect(mockOnSelect).toHaveBeenCalledWith('q-new');
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
