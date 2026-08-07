import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MockedProvider } from '@apollo/client/testing/react';
import { vi } from 'vitest';
import CreateQuotationModal from './CreateQuotationModal';
import { QUOTATIONS_QUERY, QUOTATION_QUERY } from '../graphql/queries';
import { CREATE_QUOTATION_MUTATION, UPDATE_QUOTATION_MUTATION } from '../graphql/mutations';
import type { MockLink } from '@apollo/client/testing';

const createdQuotation = {
  id: 'q-new',
  quotationNumber: 'QT-2026-0099',
  title: 'New Service',
  clientName: 'Acme Corp',
  status: 'DRAFT',
  total: 1190,
  createdAt: new Date().toISOString(),
};

const quotationsMock: MockLink.MockedResponse = {
  request: { query: QUOTATIONS_QUERY, variables: { filter: undefined } },
  result: { data: { quotations: [] } },
};

const createMock: MockLink.MockedResponse = {
  request: {
    query: CREATE_QUOTATION_MUTATION,
    variables: {
      input: {
        title: 'New Service',
        clientName: 'Acme Corp',
        notes: undefined,
        taxRate: 0,
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
        clientName: 'Acme Corp',
        notes: undefined,
        taxRate: 0,
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
    renderModal([]);
    expect(
      screen.getByRole('dialog', { name: 'Create quotation' }),
    ).toBeInTheDocument();
  });

  it('renders form fields', () => {
    renderModal([]);
    expect(screen.getByPlaceholderText(/Software Development/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Acme Corp/i)).toBeInTheDocument();
  });

  it('calls onClose when Cancel is clicked', async () => {
    const user = userEvent.setup();
    renderModal([]);
    await user.click(screen.getByText('Cancel'));
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('calls onClose when × button is clicked', async () => {
    const user = userEvent.setup();
    renderModal([]);
    await user.click(screen.getByLabelText('Close'));
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('shows validation error when no client name entered on submit', async () => {
    const user = userEvent.setup();
    renderModal([]);

    await user.type(screen.getByPlaceholderText(/Software Development/i), 'New Service');
    await user.click(screen.getByText('Create Quotation'));

    expect(screen.getByText('Please enter a client name.')).toBeInTheDocument();
  });

  it('shows validation error when line item description is empty', async () => {
    const user = userEvent.setup();
    renderModal([]);

    await user.type(screen.getByPlaceholderText(/Software Development/i), 'New Service');
    await user.type(screen.getByPlaceholderText(/Acme Corp/i), 'Acme Corp');
    await user.click(screen.getByText('Create Quotation'));

    expect(
      screen.getByText('All line items must have a description.'),
    ).toBeInTheDocument();
  });

  it('submits successfully and calls onCreated', async () => {
    const user = userEvent.setup();
    renderModal([createMock, quotationsMock]);

    await user.type(screen.getByPlaceholderText(/Software Development/i), 'New Service');
    await user.type(screen.getByPlaceholderText(/Acme Corp/i), 'Acme Corp');

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
    renderModal([createErrorMock]);

    await user.type(screen.getByPlaceholderText(/Software Development/i), 'New Service');
    await user.type(screen.getByPlaceholderText(/Acme Corp/i), 'Acme Corp');

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

  it('shows validation error when quantity is empty', async () => {
    const user = userEvent.setup();
    renderModal([]);

    await user.type(screen.getByPlaceholderText(/Software Development/i), 'Test');
    await user.type(screen.getByPlaceholderText(/Acme Corp/i), 'Acme Corp');

    const descInputs = screen.getAllByPlaceholderText('Description');
    await user.type(descInputs[0], 'Item');

    const qtyInputs = screen.getAllByPlaceholderText('Qty');
    await user.clear(qtyInputs[0]);

    const priceInputs = screen.getAllByPlaceholderText('0.00');
    await user.type(priceInputs[0], '100');

    await user.click(screen.getByText('Create Quotation'));

    expect(
      screen.getByText('Quantity and unit price must be greater than 0.'),
    ).toBeInTheDocument();
  });

  it('submits with notes filled in', async () => {
    const user = userEvent.setup();
    const createWithNotesMock: MockLink.MockedResponse = {
      request: {
        query: CREATE_QUOTATION_MUTATION,
        variables: {
          input: {
            title: 'New Service',
            clientName: 'Acme Corp',
            notes: 'Some notes',
            taxRate: 0,
            items: [{ description: 'Consulting', quantity: 1, unitPrice: 1000 }],
          },
        },
      },
      result: { data: { createQuotation: createdQuotation } },
    };
    renderModal([createWithNotesMock, quotationsMock]);

    await user.type(screen.getByPlaceholderText(/Software Development/i), 'New Service');
    await user.type(screen.getByPlaceholderText(/Acme Corp/i), 'Acme Corp');

    const descInputs = screen.getAllByPlaceholderText('Description');
    await user.type(descInputs[0], 'Consulting');

    const qtyInputs = screen.getAllByPlaceholderText('Qty');
    await user.clear(qtyInputs[0]);
    await user.type(qtyInputs[0], '1');

    const priceInputs = screen.getAllByPlaceholderText('0.00');
    await user.type(priceInputs[0], '1000');

    await user.type(screen.getByPlaceholderText(/Optional notes/i), 'Some notes');

    await user.click(screen.getByText('Create Quotation'));
  });

  it('can add and remove line items', async () => {
    const user = userEvent.setup();
    renderModal([]);

    await user.click(screen.getByText('+ Add item'));
    expect(screen.getAllByPlaceholderText('Description')).toHaveLength(2);

    const removeButtons = screen.getAllByLabelText('Remove item');
    await user.click(removeButtons[0]);
    expect(screen.getAllByPlaceholderText('Description')).toHaveLength(1);
  });

  it('disables Add item button at the 10-item limit', async () => {
    const user = userEvent.setup();
    renderModal([]);

    for (let i = 0; i < 9; i++) {
      await user.click(screen.getByText('+ Add item'));
    }

    expect(screen.getAllByPlaceholderText('Description')).toHaveLength(10);
    expect(screen.getByText('+ Add item')).toBeDisabled();
  });

  it('strips HTML tags from title input', async () => {
    const user = userEvent.setup();
    renderModal([]);

    const titleInput = screen.getByPlaceholderText(/Software Development/i);
    await user.type(titleInput, '<script>alert(1)</script>');
    expect(titleInput).toHaveValue('alert(1)');
  });

  it('updates tax rate when changed', async () => {
    const user = userEvent.setup();
    renderModal([]);

    const taxInput = screen.getByDisplayValue('0');
    await user.clear(taxInput);
    await user.type(taxInput, '21');
    expect(taxInput).toHaveValue(21);
  });

  it('blocks e and E keys in tax rate input', async () => {
    const user = userEvent.setup();
    renderModal([]);

    const taxInput = screen.getByDisplayValue('0');
    await user.type(taxInput, 'e');
    expect(taxInput).toHaveValue(0);
  });

  it('shows red counter when notes reaches max length', () => {
    renderModal([]);

    const notesArea = screen.getByPlaceholderText(/Optional notes/i);
    fireEvent.change(notesArea, { target: { value: 'a'.repeat(500) } });
    expect(screen.getByText('500/500')).toHaveClass('text-red-500');
  });

  it('shows red counter when title reaches max length', () => {
    renderModal([]);

    const titleInput = screen.getByPlaceholderText(/Software Development/i);
    fireEvent.change(titleInput, { target: { value: 'a'.repeat(100) } });
    expect(screen.getByText('100/100')).toHaveClass('text-red-500');
  });
});

describe('CreateQuotationModal — edit mode', () => {
  const existingQuotation = {
    id: 'q-1',
    title: 'Old Title',
    clientName: 'Old Corp',
    notes: 'Old notes',
    taxRate: 0,
    version: 1,
    items: [{ description: 'Old Item', quantity: 1, unitPrice: 500, sortOrder: 0 }],
  };

  const updateMock: MockLink.MockedResponse = {
    request: {
      query: UPDATE_QUOTATION_MUTATION,
      variables: {
        id: 'q-1',
        input: {
          title: 'Old Title',
          version: 1,
          clientName: 'Old Corp',
          notes: 'Old notes',
          taxRate: 0,
          items: [{ description: 'Old Item', quantity: 1, unitPrice: 500 }],
        },
      },
    },
    result: { data: { updateQuotation: { id: 'q-1', title: 'Old Title' } } },
  };

  const quotationRefetchMock: MockLink.MockedResponse = {
    request: { query: QUOTATION_QUERY, variables: { id: 'q-1' } },
    result: { data: { quotation: null } },
  };

  function renderEditModal(mocks: MockLink.MockedResponse[]) {
    return render(
      <MockedProvider mocks={mocks}>
        <CreateQuotationModal
          onClose={vi.fn()}
          onCreated={vi.fn()}
          quotation={existingQuotation}
        />
      </MockedProvider>,
    );
  }

  afterEach(() => vi.clearAllMocks());

  it('renders in edit mode with pre-populated fields', () => {
    renderEditModal([]);
    expect(screen.getByRole('dialog', { name: 'Edit quotation' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('Old Title')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Old Corp')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Old notes')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Old Item')).toBeInTheDocument();
    expect(screen.getByText('Save Changes')).toBeInTheDocument();
  });

  it('calls updateQuotation and closes on save', async () => {
    const user = userEvent.setup();
    const mockOnClose = vi.fn();
    render(
      <MockedProvider mocks={[updateMock, quotationRefetchMock]}>
        <CreateQuotationModal
          onClose={mockOnClose}
          onCreated={vi.fn()}
          quotation={existingQuotation}
        />
      </MockedProvider>,
    );
    await user.click(screen.getByText('Save Changes'));
    await waitFor(() => expect(mockOnClose).toHaveBeenCalled());
  });
});
