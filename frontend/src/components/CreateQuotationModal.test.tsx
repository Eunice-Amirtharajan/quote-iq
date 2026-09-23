import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MockedProvider } from '@apollo/client/testing/react';
import { vi } from 'vitest';
import CreateQuotationModal from './CreateQuotationModal';
import { QUOTATIONS_QUERY, QUOTATION_QUERY, CLIENTS_QUERY } from '../graphql/queries';
import { CREATE_QUOTATION_MUTATION, UPDATE_QUOTATION_MUTATION } from '../graphql/mutations';

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u-1', name: 'Anna Manager', email: 'anna@example.com', role: 'SALES_MANAGER' },
    setUser: vi.fn(),
  }),
}));

const CLIENT_ACME = { __typename: 'ClientType', id: 'c-1', name: 'Acme Corp', email: null };
const CLIENT_OLD = { __typename: 'ClientType', id: 'c-2', name: 'Old Corp', email: null };

const clientsMock = {
  request: { query: CLIENTS_QUERY },
  result: { data: { clients: [CLIENT_ACME, CLIENT_OLD] } },
};

// Provide extra copies so tests that re-render don't exhaust the mock
const clientsMockExtra = {
  request: { query: CLIENTS_QUERY },
  result: { data: { clients: [CLIENT_ACME, CLIENT_OLD] } },
};

const createdQuotation = {
  id: 'q-new',
  quotationNumber: 'QT-2026-0099',
  title: 'New Service',
  client: { id: 'c-1', name: 'Acme Corp' },
  status: 'DRAFT',
  total: 1190,
  createdAt: new Date().toISOString(),
};

const quotationsMock = {
  request: { query: QUOTATIONS_QUERY, variables: { filter: undefined } },
  result: { data: { quotations: [] } },
};

const createMock = {
  request: {
    query: CREATE_QUOTATION_MUTATION,
    variables: {
      input: {
        title: 'New Service',
        clientId: 'c-1',
        notes: undefined,
        taxRate: 0,
        items: [{ description: 'Consulting', quantity: 1, unitPrice: 1000 }],
      },
    },
  },
  result: { data: { createQuotation: createdQuotation } },
};

const createErrorMock = {
  request: {
    query: CREATE_QUOTATION_MUTATION,
    variables: {
      input: {
        title: 'New Service',
        clientId: 'c-1',
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderModal(mocks: any[]) {
  return render(
    <MockedProvider mocks={[clientsMock, ...mocks]}>
      <CreateQuotationModal onClose={mockOnClose} onCreated={mockOnCreated} />
    </MockedProvider>,
  );
}

async function selectClient(user: ReturnType<typeof userEvent.setup>, clientName: string) {
  const clientInput = screen.getByPlaceholderText(/Search or create a client/i);
  await user.click(clientInput);
  await screen.findByRole('listbox');
  await user.click(screen.getByRole('option', { name: clientName }));
}

describe('CreateQuotationModal', () => {
  afterEach(() => vi.clearAllMocks());

  it('renders the modal with dialog role', () => {
    renderModal([]);
    expect(
      screen.getByRole('dialog', { name: 'Create quotation' }),
    ).toBeInTheDocument();
  });

  it('renders form fields including client selector', () => {
    renderModal([]);
    expect(screen.getByPlaceholderText(/Software Development/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Search or create a client/i)).toBeInTheDocument();
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

  it('shows validation error when no client selected on submit', async () => {
    const user = userEvent.setup();
    renderModal([]);

    await user.type(screen.getByPlaceholderText(/Software Development/i), 'New Service');
    await user.click(screen.getByText('Create Quotation'));

    expect(screen.getByText('Please select or create a client.')).toBeInTheDocument();
  });

  it('shows validation error when line item description is empty', async () => {
    const user = userEvent.setup();
    renderModal([]);

    await user.type(screen.getByPlaceholderText(/Software Development/i), 'New Service');
    await selectClient(user, 'Acme Corp');
    await user.click(screen.getByText('Create Quotation'));

    expect(
      screen.getByText('All line items must have a description.'),
    ).toBeInTheDocument();
  });

  it('submits successfully and calls onCreated', async () => {
    const user = userEvent.setup();
    renderModal([createMock, quotationsMock]);

    await user.type(screen.getByPlaceholderText(/Software Development/i), 'New Service');
    await selectClient(user, 'Acme Corp');

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
    await selectClient(user, 'Acme Corp');

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
    await selectClient(user, 'Acme Corp');

    const descInputs = screen.getAllByPlaceholderText('Description');
    await user.type(descInputs[0], 'Item');

    const qtyInputs = screen.getAllByPlaceholderText('Qty');
    await user.clear(qtyInputs[0]);

    const priceInputs = screen.getAllByPlaceholderText('0.00');
    await user.type(priceInputs[0], '100');

    await user.click(screen.getByText('Create Quotation'));

    expect(
      screen.getByText('Quantity must be a whole number greater than 0.'),
    ).toBeInTheDocument();
  });

  it('submits with notes filled in', async () => {
    const user = userEvent.setup();
    const createWithNotesMock = {
      request: {
        query: CREATE_QUOTATION_MUTATION,
        variables: {
          input: {
            title: 'New Service',
            clientId: 'c-1',
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
    await selectClient(user, 'Acme Corp');

    const descInputs = screen.getAllByPlaceholderText('Description');
    await user.type(descInputs[0], 'Consulting');

    const qtyInputs = screen.getAllByPlaceholderText('Qty');
    await user.clear(qtyInputs[0]);
    await user.type(qtyInputs[0], '1');

    const priceInputs = screen.getAllByPlaceholderText('0.00');
    await user.type(priceInputs[0], '1000');

    await user.type(screen.getByPlaceholderText(/Optional notes/i), 'Some notes');

    await user.click(screen.getByText('Create Quotation'));

    await waitFor(() => {
      expect(mockOnCreated).toHaveBeenCalledWith('q-new');
    });
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

  it('shows validation error when unit price is 0', async () => {
    const user = userEvent.setup();
    renderModal([]);

    await user.type(screen.getByPlaceholderText(/Software Development/i), 'Test');
    await selectClient(user, 'Acme Corp');

    const descInputs = screen.getAllByPlaceholderText('Description');
    await user.type(descInputs[0], 'Item');

    const qtyInputs = screen.getAllByPlaceholderText('Qty');
    await user.clear(qtyInputs[0]);
    await user.type(qtyInputs[0], '1');

    // leave unit price at 0 (default)
    await user.click(screen.getByText('Create Quotation'));

    expect(
      screen.getByText('Unit price must be a number greater than 0.'),
    ).toBeInTheDocument();
  });

  it('blocks e and E keys in quantity input', async () => {
    const user = userEvent.setup();
    renderModal([]);

    const qtyInput = screen.getAllByPlaceholderText('Qty')[0];
    await user.clear(qtyInput);
    await user.type(qtyInput, 'e');
    expect(qtyInput).toHaveValue(null);
  });

  it('blocks e and E keys in unit price input', async () => {
    const user = userEvent.setup();
    renderModal([]);

    const priceInput = screen.getAllByPlaceholderText('0.00')[0];
    await user.type(priceInput, 'e');
    expect(priceInput).toHaveValue(null);
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
    client: { id: 'c-2', name: 'Old Corp' },
    notes: 'Old notes',
    taxRate: 0,
    version: 1,
    items: [{ description: 'Old Item', quantity: 1, unitPrice: 500, sortOrder: 0 }],
  };

  const updateMock = {
    request: {
      query: UPDATE_QUOTATION_MUTATION,
      variables: {
        id: 'q-1',
        input: {
          title: 'Old Title',
          version: 1,
          clientId: 'c-2',
          notes: 'Old notes',
          taxRate: 0,
          items: [{ description: 'Old Item', quantity: 1, unitPrice: 500 }],
        },
      },
    },
    result: { data: { updateQuotation: { id: 'q-1', title: 'Old Title' } } },
  };

  const quotationRefetchMock = {
    request: { query: QUOTATION_QUERY, variables: { id: 'q-1' } },
    result: { data: { quotation: null } },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function renderEditModal(mocks: any[]) {
    return render(
      <MockedProvider mocks={[clientsMock, clientsMockExtra, ...mocks]}>
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
    expect(screen.getByDisplayValue('Old notes')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Old Item')).toBeInTheDocument();
    expect(screen.getByText('Save Changes')).toBeInTheDocument();
  });

  it('sorts multi-item quotation by sortOrder when pre-populating', () => {
    const multiItemQuotation = {
      ...existingQuotation,
      items: [
        { description: 'Second', quantity: 1, unitPrice: 100, sortOrder: 1 },
        { description: 'First', quantity: 2, unitPrice: 200, sortOrder: 0 },
      ],
    };
    render(
      <MockedProvider mocks={[clientsMock]}>
        <CreateQuotationModal
          onClose={vi.fn()}
          onCreated={vi.fn()}
          quotation={multiItemQuotation}
        />
      </MockedProvider>,
    );
    const descInputs = screen.getAllByPlaceholderText('Description') as HTMLInputElement[];
    expect(descInputs[0].value).toBe('First');
    expect(descInputs[1].value).toBe('Second');
  });

  it('calls updateQuotation and closes on save', async () => {
    const user = userEvent.setup();
    const mockOnClose = vi.fn();
    render(
      <MockedProvider mocks={[clientsMock, clientsMockExtra, updateMock, quotationRefetchMock]}>
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

  it('shows error message when updateQuotation mutation fails', async () => {
    const user = userEvent.setup();
    const updateErrorMock = {
      request: {
        query: UPDATE_QUOTATION_MUTATION,
        variables: {
          id: 'q-1',
          input: {
            title: 'Old Title',
            version: 1,
            clientId: 'c-2',
            notes: 'Old notes',
            taxRate: 0,
            items: [{ description: 'Old Item', quantity: 1, unitPrice: 500 }],
          },
        },
      },
      error: new Error('Update failed'),
    };
    render(
      <MockedProvider mocks={[clientsMock, clientsMockExtra, updateErrorMock]}>
        <CreateQuotationModal
          onClose={vi.fn()}
          onCreated={vi.fn()}
          quotation={existingQuotation}
        />
      </MockedProvider>,
    );
    await user.click(screen.getByText('Save Changes'));
    expect(await screen.findByText('Update failed')).toBeInTheDocument();
  });
});
