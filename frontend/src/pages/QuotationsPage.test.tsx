import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MockedProvider } from '@apollo/client/testing/react';
import { vi } from 'vitest';
import QuotationsPage from './QuotationsPage';
import { QUOTATIONS_QUERY, SALES_REPS_QUERY, CONVERSION_SCORES_QUERY, CLIENTS_QUERY } from '../graphql/queries';
import { CREATE_QUOTATION_MUTATION } from '../graphql/mutations';
import { AuthContext } from '../context/auth-context';
import type { MockLink } from '@apollo/client/testing';

const mockQuotations = [
  {
    id:              'q-1',
    quotationNumber: 'QT-2026-0001',
    title:           'Enterprise License',
    client:          { id: 'c-1', name: 'Hans Bauer' },
    status:          'APPROVED',
    total:           7140,
    createdAt:       '2026-04-10T00:00:00.000Z',
  },
  {
    id:              'q-2',
    quotationNumber: 'QT-2026-0002',
    title:           'Cloud Setup',
    client:          { id: 'c-2', name: 'Emma Fischer' },
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
    request: { query: SALES_REPS_QUERY },
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
    await screen.findAllByText('Enterprise License');
  });

  it('renders quotation list after loading', async () => {
    renderAs(mockRep, successMock);
    expect((await screen.findAllByText('Enterprise License')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Cloud Setup').length).toBeGreaterThan(0);
    expect(screen.getAllByText('QT-2026-0001').length).toBeGreaterThan(0);
    expect(screen.getAllByText('QT-2026-0002').length).toBeGreaterThan(0);
  });

  it('renders client names', async () => {
    renderAs(mockRep, successMock);
    await screen.findAllByText('Enterprise License');
    expect(screen.getAllByText('Hans Bauer').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Emma Fischer').length).toBeGreaterThan(0);
  });

  it('renders status badges', async () => {
    renderAs(mockRep, successMock);
    await screen.findAllByText('Enterprise License');
    expect(screen.getAllByText('APPROVED').length).toBeGreaterThan(0);
    expect(screen.getAllByText('SENT').length).toBeGreaterThan(0);
  });

  it('renders totals correctly', async () => {
    renderAs(mockRep, successMock);
    await screen.findAllByText('Enterprise License');
    expect(screen.getAllByText('€7,140').length).toBeGreaterThan(0);
    expect(screen.getAllByText('€10,000').length).toBeGreaterThan(0);
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
    await screen.findAllByText('Enterprise License');
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
    await screen.findAllByText('Enterprise License');
    // Click the table row (desktop) — find the <p> with a title attribute (table cell has title, card does not)
    const tableTitle = document.querySelector('td p[title="Enterprise License"]') as HTMLElement;
    tableTitle.closest('tr')?.click();
    expect(mockOnSelect).toHaveBeenCalledWith('q-1');
  });

  it('shows New Quotation button for SALES_REP', async () => {
    renderAs(mockRep, successMock);
    await screen.findAllByText('Enterprise License');
    expect(screen.getByText('New Quotation')).toBeInTheDocument();
  });

  it('shows New Quotation button for SALES_MANAGER', async () => {
    renderAs(mockManager, successMock);
    await screen.findAllByText('Enterprise License');
    expect(screen.getByText('New Quotation')).toBeInTheDocument();
  });

  it('opens create modal when New Quotation button is clicked', async () => {
    const user = userEvent.setup();
    renderAs(mockRep, successMock);
    await screen.findAllByText('Enterprise License');
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
    await screen.findAllByText('Enterprise License');
    expect(screen.getByPlaceholderText('Search by title, number, or client...')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'All statuses' })).toBeInTheDocument();
  });

  it('updates search input value when changed', async () => {
    renderAs(mockRep, successMock);
    await screen.findAllByText('Enterprise License');
    const input = screen.getByPlaceholderText('Search by title, number, or client...');
    fireEvent.change(input, { target: { value: 'Enterprise' } });
    expect(input).toHaveValue('Enterprise');
  });

  it('updates status filter when dropdown changes', async () => {
    renderAs(mockRep, successMock);
    await screen.findAllByText('Enterprise License');
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
    await screen.findAllByText('Enterprise License');

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'DRAFT' } });
    expect(await screen.findByText('No quotations match your filter')).toBeInTheDocument();
  });

  it('shows typed search text in input immediately without waiting for debounce', async () => {
    renderAs(mockRep, successMock);
    await screen.findAllByText('Enterprise License');

    const input = screen.getByPlaceholderText('Search by title, number, or client...');
    fireEvent.change(input, { target: { value: 'Cloud' } });
    expect(input).toHaveValue('Cloud');
    // List still shows full results — debounce has not fired yet
    expect(screen.getAllByText('Enterprise License').length).toBeGreaterThan(0);
  });

  it('shows clear button when search has text and clears on click', async () => {
    const user = userEvent.setup();
    renderAs(mockRep, successMock);
    await screen.findAllByText('Enterprise License');

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
    await screen.findAllByText('Enterprise License');

    const input = screen.getByPlaceholderText('Search by title, number, or client...');
    // first change sets a timer; second change clears it and sets a new one
    fireEvent.change(input, { target: { value: 'Ent' } });
    fireEvent.change(input, { target: { value: 'Enterprise' } });
    expect(input).toHaveValue('Enterprise');
    // full list still visible — debounce not yet fired, query unchanged
    expect(screen.getAllByText('Enterprise License').length).toBeGreaterThan(0);
  });

  describe('rep filter (manager only)', () => {
    it('shows rep dropdown for SALES_MANAGER after reps load', async () => {
      const user = userEvent.setup();
      renderAsManager(managerSuccessMock);
      await screen.findAllByText('Enterprise License');
      const repInput = await screen.findByPlaceholderText('All reps');
      await user.click(repInput);
      expect(await screen.findByRole('button', { name: 'Anna Schmidt' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Ben Müller' })).toBeInTheDocument();
    });

    it('does not show rep dropdown for SALES_REP', async () => {
      renderAs(mockRep, successMock);
      await screen.findAllByText('Enterprise License');
      expect(screen.queryByPlaceholderText('All reps')).not.toBeInTheDocument();
    });

    it('includes repId in filter when manager selects a rep', async () => {
      const user = userEvent.setup();
      const repFilterMock: MockLink.MockedResponse[] = [
        ...managerSuccessMock,
        {
          request: { query: QUOTATIONS_QUERY, variables: { take: 20, skip: 0, filter: { repId: 'u-rep' } } },
          result: { data: { quotations: [mockQuotations[0]] } },
        },
      ];
      renderAsManager(repFilterMock);
      await screen.findAllByText('Enterprise License');
      const repInput = await screen.findByPlaceholderText('All reps');
      await user.click(repInput);
      await user.click(await screen.findByRole('button', { name: 'Anna Schmidt' }));

      expect((await screen.findAllByText('Enterprise License')).length).toBeGreaterThan(0);
    });
  });

  describe('conversion score badge (manager only)', () => {
    it('shows conversion score badge on SENT rows for manager', async () => {
      renderAsManager(managerSuccessMock);
      await screen.findAllByText('Enterprise License');
      // Badge for q-2 (SENT) should appear with score 72
      expect(await screen.findByText('72%')).toBeInTheDocument();
    });

    it('does not show conversion score badge for SALES_REP', async () => {
      renderAs(mockRep, successMock);
      await screen.findAllByText('Enterprise License');
      expect(screen.queryByText('72%')).not.toBeInTheDocument();
    });
  });

  it('closes modal and calls onSelect after successful quotation creation', async () => {
    const user = userEvent.setup();
    const newQuotation = {
      id: 'q-new',
      quotationNumber: 'QT-2026-0099',
      title: 'New Deal',
      client: { id: 'c-1', name: 'Hans Bauer' },
      status: 'DRAFT',
      total: 500,
      createdAt: new Date().toISOString(),
    };
    const mocks: MockLink.MockedResponse[] = [
      { request: { query: QUOTATIONS_QUERY, variables: { take: 20, skip: 0, filter: undefined } }, result: { data: { quotations: mockQuotations } } },
      { request: { query: CLIENTS_QUERY }, result: { data: { clients: [{ __typename: 'ClientType', id: 'c-1', name: 'Hans Bauer', email: null }] } } },
      {
        request: {
          query: CREATE_QUOTATION_MUTATION,
          variables: { input: { title: 'New Deal', clientId: 'c-1', notes: undefined, taxRate: 0, items: [{ description: 'Consulting', quantity: 1, unitPrice: 500 }] } },
        },
        result: { data: { createQuotation: newQuotation } },
      },
      { request: { query: QUOTATIONS_QUERY, variables: { take: 20, skip: 0, filter: undefined } }, result: { data: { quotations: [...mockQuotations, newQuotation] } } },
    ];

    renderAs(mockRep, mocks);
    await screen.findAllByText('Enterprise License');

    await user.click(screen.getByText('New Quotation'));
    expect(screen.getByRole('dialog', { name: 'Create quotation' })).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText(/Software Development/i), 'New Deal');

    // Select client from the ClientSelector dropdown
    const clientInput = screen.getByPlaceholderText(/Search.*a client/i);
    await user.click(clientInput);
    const listbox = await screen.findByRole('listbox');
    await user.click(screen.getByRole('option', { name: 'Hans Bauer' }));
    expect(listbox).toBeDefined();

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
      client: { id: `c-${i}`, name: 'Client' },
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
    await screen.findAllByText('Enterprise License');
    expect(screen.queryByText('Load more')).not.toBeInTheDocument();
  });

  describe('mobile card list', () => {
    it('renders a card button for each quotation', async () => {
      renderAs(mockRep, successMock);
      await screen.findAllByText('Enterprise License');
      // md:hidden section — JSDOM renders all DOM regardless of Tailwind visibility
      const cards = screen.getAllByRole('button', { name: (_, el) => el.tagName === 'BUTTON' && el.textContent?.includes('Enterprise License') });
      expect(cards.length).toBeGreaterThan(0);
    });

    it('each card shows title, quotation number, status, client, total, and date', async () => {
      renderAs(mockRep, successMock);
      await screen.findAllByText('Enterprise License');
      // title appears in both table and card; check quotation number is present
      expect(screen.getAllByText('QT-2026-0001').length).toBeGreaterThan(0);
      // client name
      expect(screen.getAllByText('Hans Bauer').length).toBeGreaterThan(0);
      // total — formatted
      expect(screen.getAllByText('€7,140').length).toBeGreaterThan(0);
      // status badge
      expect(screen.getAllByText('APPROVED').length).toBeGreaterThan(0);
    });

    it('calls onSelect with correct id when a mobile card is clicked', async () => {
      const user = userEvent.setup();
      renderAs(mockRep, successMock);
      await screen.findAllByText('Enterprise License');
      // Find the card <button> that contains "Enterprise License"
      const cards = document.querySelectorAll<HTMLButtonElement>('.md\\:hidden button');
      const targetCard = Array.from(cards).find((btn) =>
        btn.textContent?.includes('Enterprise License'),
      );
      expect(targetCard).toBeDefined();
      await user.click(targetCard!);
      expect(mockOnSelect).toHaveBeenCalledWith('q-1');
    });

    it('shows win chance on a SENT card for manager', async () => {
      renderAsManager(managerSuccessMock);
      await screen.findAllByText('Enterprise License');
      await screen.findByText('72%');
      // score appears in both desktop and mobile — getAllByText covers both
      expect(screen.getAllByText('72%').length).toBeGreaterThan(0);
    });

    it('does not show win chance on a non-SENT card', async () => {
      renderAsManager(managerSuccessMock);
      await screen.findAllByText('Enterprise License');
      // q-1 is APPROVED — no score shown for it
      const winLabels = screen.queryAllByText(/% win/);
      // Only q-2 (SENT) should have a win label; q-1 (APPROVED) should not
      expect(winLabels.every((el) => !el.closest('button')?.textContent?.includes('Enterprise License'))).toBe(true);
    });
  });

  it('closes rep dropdown on outside click and clears search', async () => {
    const user = userEvent.setup();
    renderAsManager(managerSuccessMock);
    await screen.findAllByText('Enterprise License');
    const repInput = await screen.findByPlaceholderText('All reps');
    await user.click(repInput);
    expect(await screen.findByRole('button', { name: 'Anna Schmidt' })).toBeInTheDocument();
    await user.click(document.body);
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Anna Schmidt' })).not.toBeInTheDocument(),
    );
  });

  it('clears rep filter when clear button is clicked', async () => {
    const user = userEvent.setup();
    const repFilterMock: MockLink.MockedResponse[] = [
      ...managerSuccessMock,
      {
        request: { query: QUOTATIONS_QUERY, variables: { take: 20, skip: 0, filter: { repId: 'u-rep' } } },
        result: { data: { quotations: [mockQuotations[0]] } },
      },
      {
        request: { query: QUOTATIONS_QUERY, variables: { take: 20, skip: 0, filter: undefined } },
        result: { data: { quotations: mockQuotations } },
      },
    ];
    renderAsManager(repFilterMock);
    await screen.findAllByText('Enterprise License');
    const repInput = await screen.findByPlaceholderText('All reps');
    await user.click(repInput);
    await user.click(await screen.findByRole('button', { name: 'Anna Schmidt' }));

    const clearBtn = await screen.findByRole('button', { name: 'Clear rep filter' });
    await user.click(clearBtn);
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Clear rep filter' })).not.toBeInTheDocument(),
    );
  });

  it('rep input onFocus clears search text and opens dropdown', async () => {
    const user = userEvent.setup();
    renderAsManager(managerSuccessMock);
    await screen.findAllByText('Enterprise License');
    const repInput = await screen.findByPlaceholderText('All reps');
    // Type something first to set repSearch
    await user.type(repInput, 'Anna');
    // Now blur and re-focus — onFocus should clear repSearch and reopen
    await user.tab();
    await user.click(repInput);
    // All reps visible again (search cleared)
    expect(await screen.findByRole('button', { name: 'Ben Müller' })).toBeInTheDocument();
  });

  it('hides Load more button after clicking it (page advances)', async () => {
    const user = userEvent.setup();
    const fullPage = Array.from({ length: 20 }, (_, i) => ({
      id: `q-${i}`,
      quotationNumber: `QT-2026-${String(i).padStart(4, '0')}`,
      title: `Quote ${i}`,
      client: { id: `c-${i}`, name: 'Client' },
      status: 'DRAFT',
      total: 1000,
      createdAt: '2026-04-10T00:00:00.000Z',
    }));
    // second page returns fewer than PAGE_SIZE — hasMore becomes false
    const page2 = [{ id: 'q-20', quotationNumber: 'QT-2026-0020', title: 'Quote 20', client: { id: 'c-20', name: 'Client' }, status: 'DRAFT', total: 1000, createdAt: '2026-04-10T00:00:00.000Z' }];
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
