import { useState } from "react";
import { useMutation, useQuery } from "@apollo/client/react";
import { CREATE_QUOTATION_MUTATION } from "../graphql/mutations";
import { CLIENTS_QUERY, QUOTATIONS_QUERY } from "../graphql/queries";

interface Client {
  id: string;
  name: string;
  company: string;
}

interface LineItem {
  description: string;
  quantity: string;
  unitPrice: string;
}

interface Props {
  onClose: () => void;
  onCreated: (id: string) => void;
}

const EMPTY_ITEM: LineItem = { description: "", quantity: "1", unitPrice: "" };

export default function CreateQuotationModal({ onClose, onCreated }: Readonly<Props>) {
  const [title, setTitle] = useState("");
  const [clientId, setClientId] = useState("");
  const [notes, setNotes] = useState("");
  const [taxRate, setTaxRate] = useState("19");
  const [validUntil, setValidUntil] = useState("");
  const [items, setItems] = useState<LineItem[]>([{ ...EMPTY_ITEM }]);
  const [formError, setFormError] = useState<string | null>(null);

  const { data: clientsData } = useQuery<{ clients: Client[] }>(CLIENTS_QUERY);
  const clients = clientsData?.clients ?? [];

  const [createQuotation, { loading }] = useMutation(CREATE_QUOTATION_MUTATION, {
    refetchQueries: [{ query: QUOTATIONS_QUERY }],
    onCompleted: (data) => {
      onCreated(data.createQuotation.id as string);
    },
    onError: (err) => setFormError(err.message),
  });

  const updateItem = (index: number, field: keyof LineItem, value: string) => {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
    );
  };

  const addItem = () => setItems((prev) => [...prev, { ...EMPTY_ITEM }]);

  const removeItem = (index: number) =>
    setItems((prev) => prev.filter((_, i) => i !== index));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!clientId) { setFormError("Please select a client."); return; }
    if (items.some((it) => !it.description.trim())) {
      setFormError("All line items must have a description.");
      return;
    }
    if (items.some((it) => Number(it.quantity) <= 0 || Number(it.unitPrice) <= 0)) {
      setFormError("Quantity and unit price must be greater than 0.");
      return;
    }

    void createQuotation({
      variables: {
        input: {
          title: title.trim(),
          clientId,
          notes: notes.trim() || undefined,
          taxRate: Number(taxRate),
          validUntil: validUntil ? new Date(validUntil).toISOString() : undefined,
          items: items.map((it) => ({
            description: it.description.trim(),
            quantity: Number(it.quantity),
            unitPrice: Number(it.unitPrice),
          })),
        },
      },
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-label="Create quotation"
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">New Quotation</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-gray-400 hover:text-gray-900 transition-colors text-xl leading-none"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              placeholder="e.g. Software Development Services Q3"
            />
          </div>

          {/* Client */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Client <span className="text-red-500">*</span>
            </label>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
            >
              <option value="">Select a client…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {c.company}
                </option>
              ))}
            </select>
          </div>

          {/* Tax rate + Valid until */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Tax Rate (%)
              </label>
              <input
                type="number"
                value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)}
                min="0"
                max="100"
                step="0.1"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Valid Until
              </label>
              <input
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
          </div>

          {/* Line items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-700">
                Line Items <span className="text-red-500">*</span>
              </label>
              <button
                type="button"
                onClick={addItem}
                className="text-xs text-gray-500 hover:text-gray-900 transition-colors"
              >
                + Add item
              </button>
            </div>
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <input
                    type="text"
                    value={item.description}
                    onChange={(e) => updateItem(idx, "description", e.target.value)}
                    placeholder="Description"
                    className="col-span-6 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                  <input
                    type="number"
                    value={item.quantity}
                    onChange={(e) => updateItem(idx, "quantity", e.target.value)}
                    placeholder="Qty"
                    step="0.01"
                    className="col-span-2 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                  <div className="col-span-3 flex items-center border border-gray-200 rounded-lg focus-within:ring-2 focus-within:ring-gray-900 overflow-hidden">
                    <span className="px-2 text-sm text-gray-400 bg-gray-50 border-r border-gray-200 select-none">€</span>
                    <input
                      type="number"
                      value={item.unitPrice}
                      onChange={(e) => updateItem(idx, "unitPrice", e.target.value)}
                      placeholder="0.00"
                      step="0.01"
                      className="flex-1 px-2 py-2 text-sm focus:outline-none bg-white"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(idx)}
                    disabled={items.length === 1}
                    aria-label="Remove item"
                    className="col-span-1 text-gray-300 hover:text-red-500 transition-colors disabled:opacity-30 text-lg leading-none"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
              placeholder="Optional notes for the client…"
            />
          </div>

          {formError && (
            <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">
              {formError}
            </p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-500 hover:text-gray-900 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Creating…" : "Create Quotation"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
