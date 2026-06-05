import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MockedProvider } from '@apollo/client/testing/react';
import { vi } from 'vitest';
import CreateQuotationModal from './CreateQuotationModal';
import { CLIENTS_QUERY, QUOTATIONS_QUERY } from '../graphql/queries';
import { CREATE_QUOTATION_MUTATION } from '../graphql/mutations';
import type { MockLink } from '@apollo/client/testing';

const mockClients = [
  { id: 'c-1', name: 'Hans Bauer', company: 'Bauer GmbH' },
  { id: 'c-2', name: 'Emma Fischer', company: 'Fischer Tech' },
];

const createdQuotation = {
  id: 'q-new',
  quotationNumber: 'QT-2026-0099',
  title: 'New Service',
  status: 'DRAFT',
  total: 1190,
  createdAt: new Date().toISOString(),
  client: { name: 'Hans Bauer', company: 'Bauer GmbH' },
};

const clientsMock: MockLink.MockedResponse = {
  request: { query: CLIENTS_QUERY },
  result: { data: { clients: mockClients } },
};

const quotationsMock: MockLink.MockedResponse = {
  request: { query: QUOTATIONS_QUERY },
  result: { data: { quotations: [] } },
};

const createMock: MockLink.MockedResponse = {
  request: {
    query: CREATE_QUOTATION_MUTATION,
    variables: {
      input: {
        title: 'New Service',
        clientId: 'c-1',
        notes: undefined,
        taxRate: 19,
        validUntil: undefined,
        items: [{ description: 'Consulting', quantity: 1, unitPrice: 1000 }],
      },
    },
  },
  result: { data: { createQuotation: createdQuotation } },
};

const createErrorMock: MockLink.MockedResponse = {
  request: {
    query: CREATE_QUOTATION_MUTATION,
    variables: {
      input: {
        title: 'New Service',
        clientId: 'c-1',
        notes: undefined,
        taxRate: 19,
        validUntil: undefined,
        items: [{ description: 'Consulting', quantity: 1, unitPrice: 1000 }],
      },
    },
  },
  error: new Error('Client not found'),
};

const mockOnClose = vi.fn();
const mockOnCreated = vi.fn();

function renderModal(mocks: MockLink.MockedResponse[]) {
  return render(
    <MockedProvider mocks={mocks}>
      <CreateQuotationModal onClose={mockOnClose} onCreated={mockOnCreated} />
    </MockedProvider>,
  );
}

describe('CreateQuotationModal', () => {
  afterEach(() => vi.clearAllMocks());

  it('renders the modal with dialog role', () => {
    renderModal([clientsMock]);
    expect(
      screen.getByRole('dialog', { name: 'Create quotation' }),
    ).toBeInTheDocument();
  });

  it('renders form fields', () => {
    renderModal([clientsMock]);
    expect(screen.getByPlaceholderText(/Software Development/i)).toBeInTheDocument();
    expect(screen.getByText('Select a client…')).toBeInTheDocument();
  });

  it('calls onClose when Cancel is clicked', async () => {
    const user = userEvent.setup();
    renderModal([clientsMock]);
    await user.click(screen.getByText('Cancel'));
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('calls onClose when × button is clicked', async () => {
    const user = userEvent.setup();
    renderModal([clientsMock]);
    await user.click(screen.getByLabelText('Close'));
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('shows client options after loading', async () => {
    renderModal([clientsMock]);
    expect(
      await screen.findByRole('option', { name: /Hans Bauer/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: /Emma Fischer/i }),
    ).toBeInTheDocument();
  });

  it('shows validation error when no client selected on submit', async () => {
    const user = userEvent.setup();
    renderModal([clientsMock]);
    await screen.findByRole('option', { name: /Hans Bauer/i });

    await user.type(screen.getByPlaceholderText(/Software Development/i), 'New Service');
    await user.click(screen.getByText('Create Quotation'));

    expect(screen.getByText('Please select a client.')).toBeInTheDocument();
  });

  it('shows validation error when line item description is empty', async () => {
    const user = userEvent.setup();
    renderModal([clientsMock]);
    await screen.findByRole('option', { name: /Hans Bauer/i });

    await user.type(screen.getByPlaceholderText(/Software Development/i), 'New Service');
    await user.selectOptions(screen.getByRole('combobox'), 'c-1');
    await user.click(screen.getByText('Create Quotation'));

    expect(
      screen.getByText('All line items must have a description.'),
    ).toBeInTheDocument();
  });

  it('submits successfully and calls onCreated', async () => {
    const user = userEvent.setup();
    renderModal([clientsMock, createMock, quotationsMock]);
    await screen.findByRole('option', { name: /Hans Bauer/i });

    await user.type(screen.getByPlaceholderText(/Software Development/i), 'New Service');
    await user.selectOptions(screen.getByRole('combobox'), 'c-1');

    const descInputs = screen.getAllByPlaceholderText('Description');
    await user.type(descInputs[0], 'Consulting');

    const qtyInputs = screen.getAllByPlaceholderText('Qty');
    await user.clear(qtyInputs[0]);
    await user.type(qtyInputs[0], '1');

    const priceInputs = screen.getAllByPlaceholderText('0.00');
    await user.type(priceInputs[0], '1000');

    await user.click(screen.getByText('Create Quotation'));

    await waitFor(() => {
      expect(mockOnCreated).toHaveBeenCalledWith('q-new');
    });
  });

  it('shows error message when mutation fails', async () => {
    const user = userEvent.setup();
    renderModal([clientsMock, createErrorMock]);
    await screen.findByRole('option', { name: /Hans Bauer/i });

    await user.type(screen.getByPlaceholderText(/Software Development/i), 'New Service');
    await user.selectOptions(screen.getByRole('combobox'), 'c-1');

    const descInputs = screen.getAllByPlaceholderText('Description');
    await user.type(descInputs[0], 'Consulting');

    const qtyInputs = screen.getAllByPlaceholderText('Qty');
    await user.clear(qtyInputs[0]);
    await user.type(qtyInputs[0], '1');

    const priceInputs = screen.getAllByPlaceholderText('0.00');
    await user.type(priceInputs[0], '1000');

    await user.click(screen.getByText('Create Quotation'));

    expect(await screen.findByText('Client not found')).toBeInTheDocument();
  });

  it('shows validation error when quantity is zero', async () => {
    const user = userEvent.setup();
    renderModal([clientsMock]);
    await screen.findByRole('option', { name: /Hans Bauer/i });

    await user.type(screen.getByPlaceholderText(/Software Development/i), 'Test');
    await user.selectOptions(screen.getByRole('combobox'), 'c-1');

    const descInputs = screen.getAllByPlaceholderText('Description');
    await user.type(descInputs[0], 'Item');

    const qtyInputs = screen.getAllByPlaceholderText('Qty');
    await user.clear(qtyInputs[0]);
    await user.type(qtyInputs[0], '0');

    const priceInputs = screen.getAllByPlaceholderText('0.00');
    await user.type(priceInputs[0], '100');

    await user.click(screen.getByText('Create Quotation'));

    expect(
      screen.getByText('Quantity and unit price must be greater than 0.'),
    ).toBeInTheDocument();
  });

  it('submits with notes and validUntil filled in', async () => {
    const user = userEvent.setup();
    const createWithNotesMock: MockLink.MockedResponse = {
      request: {
        query: CREATE_QUOTATION_MUTATION,
        variables: {
          input: {
            title: 'New Service',
            clientId: 'c-1',
            notes: 'Some notes',
            taxRate: 19,
            validUntil: new Date('2026-12-31').toISOString(),
            items: [{ description: 'Consulting', quantity: 1, unitPrice: 1000 }],
          },
        },
      },
      result: { data: { createQuotation: createdQuotation } },
    };
    renderModal([clientsMock, createWithNotesMock, quotationsMock]);
    await screen.findByRole('option', { name: /Hans Bauer/i });

    await user.type(screen.getByPlaceholderText(/Software Development/i), 'New Service');
    await user.selectOptions(screen.getByRole('combobox'), 'c-1');

    const descInputs = screen.getAllByPlaceholderText('Description');
    await user.type(descInputs[0], 'Consulting');

    const qtyInputs = screen.getAllByPlaceholderText('Qty');
    await user.clear(qtyInputs[0]);
    await user.type(qtyInputs[0], '1');

    const priceInputs = screen.getAllByPlaceholderText('0.00');
    await user.type(priceInputs[0], '1000');

    await user.type(screen.getByPlaceholderText(/Optional notes/i), 'Some notes');
    await user.type(screen.getByDisplayValue(''), '2026-12-31');

    await user.click(screen.getByText('Create Quotation'));
  });

  it('can add and remove line items', async () => {
    const user = userEvent.setup();
    renderModal([clientsMock]);

    await user.click(screen.getByText('+ Add item'));
    expect(screen.getAllByPlaceholderText('Description')).toHaveLength(2);

    const removeButtons = screen.getAllByLabelText('Remove item');
    await user.click(removeButtons[0]);
    expect(screen.getAllByPlaceholderText('Description')).toHaveLength(1);
  });
});
