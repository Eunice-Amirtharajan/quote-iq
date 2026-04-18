import { render, screen } from '@testing-library/react';
import { MockedProvider,  } from '@apollo/client/testing/react';
import { vi } from 'vitest';
import QuotationsPage from './QuotationsPage';
import { QUOTATIONS_QUERY } from '../graphql/queries';
import type { MockLink } from '@apollo/client/testing';

const mockQuotations = [
  {
    id:              'q-1',
    quotationNumber: 'QT-2026-0001',
    title:           'Enterprise License',
    status:          'APPROVED',
    total:           7140,
    createdAt:       '2026-04-10T00:00:00.000Z',
    client: {
      name:    'Hans Bauer',
      company: 'Bauer GmbH',
    },
  },
  {
    id:              'q-2',
    quotationNumber: 'QT-2026-0002',
    title:           'Cloud Setup',
    status:          'SENT',
    total:           10000,
    createdAt:       '2026-04-10T00:00:00.000Z',
    client: {
      name:    'Emma Fischer',
      company: 'Fischer Tech',
    },
  },
];

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

describe('QuotationsPage', () => {
  afterEach(() => vi.clearAllMocks());

  it('shows loading state initially', () => {
    render(
      <MockedProvider mocks={successMock}>
        <QuotationsPage onSelect={mockOnSelect} />
      </MockedProvider>,
    );
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders quotation list after loading', async () => {
    render(
      <MockedProvider mocks={successMock}>
        <QuotationsPage onSelect={mockOnSelect} />
      </MockedProvider>,
    );

    expect(await screen.findByText('Enterprise License')).toBeInTheDocument();
    expect(screen.getByText('Cloud Setup')).toBeInTheDocument();
    expect(screen.getByText('QT-2026-0001')).toBeInTheDocument();
    expect(screen.getByText('QT-2026-0002')).toBeInTheDocument();
  });

  it('renders client names and companies', async () => {
    render(
      <MockedProvider mocks={successMock}>
        <QuotationsPage onSelect={mockOnSelect} />
      </MockedProvider>,
    );

    await screen.findByText('Enterprise License');
    expect(screen.getByText('Hans Bauer')).toBeInTheDocument();
    expect(screen.getByText('Bauer GmbH')).toBeInTheDocument();
    expect(screen.getByText('Emma Fischer')).toBeInTheDocument();
  });

  it('renders status badges', async () => {
    render(
      <MockedProvider mocks={successMock}>
        <QuotationsPage onSelect={mockOnSelect} />
      </MockedProvider>,
    );

    await screen.findByText('Enterprise License');
    expect(screen.getByText('APPROVED')).toBeInTheDocument();
    expect(screen.getByText('SENT')).toBeInTheDocument();
  });

  it('renders totals correctly', async () => {
    render(
      <MockedProvider mocks={successMock}>
        <QuotationsPage onSelect={mockOnSelect} />
      </MockedProvider>,
    );

    await screen.findByText('Enterprise License');
    expect(screen.getByText('€7,140')).toBeInTheDocument();
    expect(screen.getByText('€10,000')).toBeInTheDocument();
  });

  it('shows total count', async () => {
    render(
      <MockedProvider mocks={successMock}>
        <QuotationsPage onSelect={mockOnSelect} />
      </MockedProvider>,
    );

    expect(await screen.findByText('2 total')).toBeInTheDocument();
  });

  it('shows empty state when no quotations', async () => {
    render(
      <MockedProvider mocks={emptyMock}>
        <QuotationsPage onSelect={mockOnSelect} />
      </MockedProvider>,
    );

    expect(await screen.findByText('No quotations yet')).toBeInTheDocument();
  });

  it('shows error state when query fails', async () => {
    render(
      <MockedProvider mocks={errorMock}>
        <QuotationsPage onSelect={mockOnSelect} />
      </MockedProvider>,
    );

    expect(
      await screen.findByText('Failed to load quotations'),
    ).toBeInTheDocument();
  });

  it('calls onSelect when row is clicked', async () => {
    render(
      <MockedProvider mocks={successMock}>
        <QuotationsPage onSelect={mockOnSelect} />
      </MockedProvider>,
    );

    await screen.findByText('Enterprise License');
    screen.getByText('Enterprise License').closest('tr')?.click();

    expect(mockOnSelect).toHaveBeenCalledWith('q-1');
  });
});