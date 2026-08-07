import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MockedProvider } from '@apollo/client/testing/react';
import { vi } from 'vitest';
import QuotationsPage from './QuotationsPage';
import { QUOTATIONS_QUERY, SALES_REPS_QUERY, CONVERSION_SCORES_QUERY } from '../graphql/queries';
import { CREATE_QUOTATION_MUTATION } from '../graphql/mutations';
import { AuthContext } from '../context/auth-context';
import type { MockLink } from '@apollo/client/testing';

const mockQuotations = [
  {
    id:              'q-1',
    quotationNumber: 'QT-2026-0001',
    title:           'Enterprise License',
    clientName:      'Hans Bauer',
    status:          'APPROVED',
    total:           7140,
    createdAt:       '2026-04-10T00:00:00.000Z',
  },
  {
    id:              'q-2',
    quotationNumber: 'QT-2026-0002',
    title:           'Cloud Setup',
    clientName:      'Emma Fischer',
    status:          'SENT',
    total:           10000,
    createdAt:       '2026-04-10T00:00:00.000Z',
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
    request: { query: QUOTATIONS_QUERY, variables: { take: 20, skip: 0, filter: undefined } },
    result:  { data: { quotations: mockQuotations } },
  },
];

const mockReps = [
  { id: 'u-rep', name: 'Anna Schmidt' },
  { id: 'u-rep2', name: 'Ben Müller' },
];

const managerSuccessMock: MockLink.MockedResponse[] = [
  {
    request: { query: QUOTATIONS_QUERY, variables: { take: 20, skip: 0, filter: undefined } },
    result:  { data: { quotations: mockQuotations } },
  },
  {
    request: { query: SALES_REPS_QUERY, variables: {} },
    result:  { data: { salesReps: mockReps } },
  },
  // Batch conversion scores fires once for all SENT quotations
  {
    request: { query: CONVERSION_SCORES_QUERY, variables: { quotationIds: ['q-2'] } },
    result:  { data: { conversionScores: [{ quotationId: 'q-2', score: 72, label: 'HIGH' }] } },
  },
];

const emptyMock: MockLink.MockedResponse[] = [
  {
    request: { query: QUOTATIONS_QUERY, variables: { take: 20, skip: 0, filter: undefined } },
    result:  { data: { quotations: [] } },
  },
];

const errorMock: MockLink.MockedResponse[] = [
  {
    request: { query: QUOTATIONS_QUERY, variables: { take: 20, skip: 0, filter: undefined } },
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

function renderAsManager(mocks: MockLink.MockedResponse[]) {
  return renderAs(mockManager, mocks);
}

describe('QuotationsPage', () => {
  afterEach(() => vi.clearAllMocks());

  it('shows loading state initially with skeleton rows', async () => {
    renderAs(mockRep, successMock);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
    // drain pending Apollo query so React state updates run inside act
    await screen.findByText('Enterprise License');
  });

  it('renders quotation list after loading', async () => {
    renderAs(mockRep, successMock);
    expect(await screen.findByText('Enterprise License')).toBeInTheDocument();
    expect(screen.getByText('Cloud Setup')).toBeInTheDocument();
    expect(screen.getByText('QT-2026-0001')).toBeInTheDocument();
    expect(screen.getByText('QT-2026-0002')).toBeInTheDocument();
  });

  it('renders client names', async () => {
    renderAs(mockRep, successMock);
    await screen.findByText('Enterprise License');
    expect(screen.getByText('Hans Bauer')).toBeInTheDocument();
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
        request: { query: QUOTATIONS_QUERY, variables: { take: 20, skip: 0, filter: undefined } },
        result: { data: { quotations: mockQuotations } },
      },
      {
        request: { query: QUOTATIONS_QUERY, variables: { take: 20, skip: 0, filter: { status: 'REJECTED' } } },
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
        request: { query: QUOTATIONS_QUERY, variables: { take: 20, skip: 0, filter: undefined } },
        result: { data: { quotations: mockQuotations } },
      },
      {
        request: {
          query: QUOTATIONS_QUERY,
          variables: { take: 20, skip: 0, filter: { status: 'DRAFT' } },
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

  describe('rep filter (manager only)', () => {
    it('shows rep dropdown for SALES_MANAGER after reps load', async () => {
      renderAsManager(managerSuccessMock);
      await screen.findByText('Enterprise License');
      expect(await screen.findByRole('option', { name: 'Anna Schmidt' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Ben Müller' })).toBeInTheDocument();
    });

    it('does not show rep dropdown for SALES_REP', async () => {
      renderAs(mockRep, successMock);
      await screen.findByText('Enterprise License');
      expect(screen.queryByRole('option', { name: 'Anna Schmidt' })).not.toBeInTheDocument();
    });

    it('includes repId in filter when manager selects a rep', async () => {
      const repFilterMock: MockLink.MockedResponse[] = [
        ...managerSuccessMock,
        {
          request: { query: QUOTATIONS_QUERY, variables: { take: 20, skip: 0, filter: { repId: 'u-rep' } } },
          result: { data: { quotations: [mockQuotations[0]] } },
        },
      ];
      renderAsManager(repFilterMock);
      await screen.findByText('Anna Schmidt');

      const allSelects = screen.getAllByRole('combobox');
      const repCombobox = allSelects[allSelects.length - 1];
      fireEvent.change(repCombobox, { target: { value: 'u-rep' } });

      expect(await screen.findByText('Enterprise License')).toBeInTheDocument();
    });
  });

  describe('conversion score badge (manager only)', () => {
    it('shows conversion score badge on SENT rows for manager', async () => {
      renderAsManager(managerSuccessMock);
      await screen.findByText('Enterprise License');
      // Badge for q-2 (SENT) should appear with score 72
      expect(await screen.findByText('72%')).toBeInTheDocument();
    });

    it('does not show conversion score badge for SALES_REP', async () => {
      renderAs(mockRep, successMock);
      await screen.findByText('Enterprise License');
      expect(screen.queryByText('72%')).not.toBeInTheDocument();
    });
  });

  it('closes modal and calls onSelect after successful quotation creation', async () => {
    const user = userEvent.setup();
    const newQuotation = {
      id: 'q-new',
      quotationNumber: 'QT-2026-0099',
      title: 'New Deal',
      clientName: 'Hans Bauer',
      status: 'DRAFT',
      total: 500,
      createdAt: new Date().toISOString(),
    };
    const mocks: MockLink.MockedResponse[] = [
      { request: { query: QUOTATIONS_QUERY, variables: { take: 20, skip: 0, filter: undefined } }, result: { data: { quotations: mockQuotations } } },
      {
        request: {
          query: CREATE_QUOTATION_MUTATION,
          variables: { input: { title: 'New Deal', clientName: 'Hans Bauer', notes: undefined, taxRate: 0, items: [{ description: 'Consulting', quantity: 1, unitPrice: 500 }] } },
        },
        result: { data: { createQuotation: newQuotation } },
      },
      { request: { query: QUOTATIONS_QUERY, variables: { take: 20, skip: 0, filter: undefined } }, result: { data: { quotations: [...mockQuotations, newQuotation] } } },
    ];

    renderAs(mockRep, mocks);
    await screen.findByText('Enterprise License');

    await user.click(screen.getByText('New Quotation'));
    expect(screen.getByRole('dialog', { name: 'Create quotation' })).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText(/Software Development/i), 'New Deal');
    await user.type(screen.getByPlaceholderText(/Acme Corp/i), 'Hans Bauer');
    await user.type(screen.getAllByPlaceholderText('Description')[0], 'Consulting');
    const priceInputs = screen.getAllByPlaceholderText('0.00');
    await user.type(priceInputs[0], '500');

    await user.click(screen.getByText('Create Quotation'));

    await waitFor(() => {
      expect(mockOnSelect).toHaveBeenCalledWith('q-new');
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows Load more button when a full page is returned', async () => {
    const fullPage = Array.from({ length: 20 }, (_, i) => ({
      id: `q-${i}`,
      quotationNumber: `QT-2026-${String(i).padStart(4, '0')}`,
      title: `Quote ${i}`,
      clientName: 'Client',
      status: 'DRAFT',
      total: 1000,
      createdAt: '2026-04-10T00:00:00.000Z',
    }));
    const fullPageMock: MockLink.MockedResponse[] = [
      {
        request: { query: QUOTATIONS_QUERY, variables: { take: 20, skip: 0, filter: undefined } },
        result: { data: { quotations: fullPage } },
      },
    ];
    renderAs(mockRep, fullPageMock);
    expect(await screen.findByText('Load more')).toBeInTheDocument();
  });

  it('does not show Load more button when fewer than a full page is returned', async () => {
    renderAs(mockRep, successMock);
    await screen.findByText('Enterprise License');
    expect(screen.queryByText('Load more')).not.toBeInTheDocument();
  });

  it('hides Load more button after clicking it (page advances)', async () => {
    const user = userEvent.setup();
    const fullPage = Array.from({ length: 20 }, (_, i) => ({
      id: `q-${i}`,
      quotationNumber: `QT-2026-${String(i).padStart(4, '0')}`,
      title: `Quote ${i}`,
      clientName: 'Client',
      status: 'DRAFT',
      total: 1000,
      createdAt: '2026-04-10T00:00:00.000Z',
    }));
    // second page returns fewer than PAGE_SIZE — hasMore becomes false
    const page2 = [{ id: 'q-20', quotationNumber: 'QT-2026-0020', title: 'Quote 20', clientName: 'Client', status: 'DRAFT', total: 1000, createdAt: '2026-04-10T00:00:00.000Z' }];
    const mocks: MockLink.MockedResponse[] = [
      {
        request: { query: QUOTATIONS_QUERY, variables: { take: 20, skip: 0, filter: undefined } },
        result: { data: { quotations: fullPage } },
      },
      {
        request: { query: QUOTATIONS_QUERY, variables: { take: 20, skip: 20, filter: undefined } },
        result: { data: { quotations: page2 } },
      },
    ];
    renderAs(mockRep, mocks);
    const loadMoreBtn = await screen.findByText('Load more');
    await user.click(loadMoreBtn);
    // After clicking, page advances to 1; now 21 items returned total which is < 20*2=40,
    // so hasMore becomes false and the button disappears
    await waitFor(() => expect(screen.queryByText('Load more')).not.toBeInTheDocument());
  });
});
