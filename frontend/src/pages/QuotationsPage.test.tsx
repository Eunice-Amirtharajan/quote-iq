import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MockedProvider } from '@apollo/client/testing/react';
import { vi } from 'vitest';
import QuotationsPage from './QuotationsPage';
import { QUOTATIONS_QUERY } from '../graphql/queries';
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
    request: { query: QUOTATIONS_QUERY },
    result:  { data: { quotations: mockQuotations } },
  },
];

const emptyMock: MockLink.MockedResponse[] = [
  {
    request: { query: QUOTATIONS_QUERY },
    result:  { data: { quotations: [] } },
  },
];

const errorMock: MockLink.MockedResponse[] = [
  {
    request: { query: QUOTATIONS_QUERY },
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

  it('shows loading state initially', () => {
    renderAs(mockRep, successMock);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
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
    expect(screen.getByText('APPROVED')).toBeInTheDocument();
    expect(screen.getByText('SENT')).toBeInTheDocument();
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
});
