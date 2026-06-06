import { useState } from "react";
import { useMutation } from "@apollo/client/react";
import { CREATE_QUOTATION_MUTATION } from "../graphql/mutations";
import { QUOTATIONS_QUERY } from "../graphql/queries";

interface LineItem {
  description: string;
  quantity: string;
  unitPrice: string;
}

interface Props {
  onClose: () => void;
  onCreated: (id: string) => void;
}

const TITLE_MAX = 100;
const CLIENT_MAX = 200;
const DESC_MAX = 200;
const NOTES_MAX = 500;
const ITEMS_MAX = 10;
const EMPTY_ITEM: LineItem = { description: "", quantity: "1", unitPrice: "" };

const stripTags = (v: string) => v.replace(/<[^>]*>/g, "");

export default function CreateQuotationModal({ onClose, onCreated }: Readonly<Props>) {
  const [title, setTitle] = useState("");
  const [clientName, setClientName] = useState("");
  const [notes, setNotes] = useState("");
  const [taxRate, setTaxRate] = useState("0");
  const [items, setItems] = useState<LineItem[]>([{ ...EMPTY_ITEM }]);
  const [formError, setFormError] = useState<string | null>(null);

  const [createQuotation, { loading }] = useMutation<{ createQuotation: { id: string } }>(CREATE_QUOTATION_MUTATION, {
    refetchQueries: [{ query: QUOTATIONS_QUERY, variables: { filter: undefined } }],
    onCompleted: (data) => {
      onCreated(data.createQuotation.id);
    },
    onError: (err) => setFormError(err.message),
  });

  const updateItem = (index: number, field: keyof LineItem, value: string) => {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
    );
  };

  const addItem = () => setItems((prev) => prev.length < ITEMS_MAX ? [...prev, { ...EMPTY_ITEM }] : prev);

  const removeItem = (index: number) =>
    setItems((prev) => prev.filter((_, i) => i !== index));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!clientName.trim()) { setFormError("Please enter a client name."); return; }
    if (items.some((it) => !it.description.trim())) {
      setFormError("All line items must have a description.");
      return;
    }
    const parsePrice = (v: string) => parseFloat(v);
    const validQty = (v: string) => { const n = parseInt(v, 10); return !isNaN(n) && n >= 1; };
    if (items.some((it) => !validQty(it.quantity) || parsePrice(it.unitPrice) <= 0)) {
      setFormError("Quantity and unit price must be greater than 0.");
      return;
    }

    const sanitizedNotes = stripTags(notes.trim()) || undefined;

    void createQuotation({
      variables: {
        input: {
          title: title.trim(),
          clientName: stripTags(clientName.trim()),
          notes: sanitizedNotes,
          taxRate: Number(taxRate),
          items: items.map((it) => ({
            description: it.description.trim(),
            quantity: parseInt(it.quantity, 10),
            unitPrice: parsePrice(it.unitPrice),
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
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-gray-700">
                Title <span className="text-red-500">*</span>
              </label>
              <span className={`text-xs ${title.length >= TITLE_MAX ? "text-red-500" : "text-gray-400"}`}>
                {title.length}/{TITLE_MAX}
              </span>
            </div>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(stripTags(e.target.value).slice(0, TITLE_MAX))}
              maxLength={TITLE_MAX}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              placeholder="e.g. Software Development Services Q3"
            />
          </div>

          {/* Client Name */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-gray-700">
                Client <span className="text-red-500">*</span>
              </label>
              <span className={`text-xs ${clientName.length >= CLIENT_MAX ? "text-red-500" : "text-gray-400"}`}>
                {clientName.length}/{CLIENT_MAX}
              </span>
            </div>
            <input
              type="text"
              value={clientName}
              onChange={(e) => setClientName(stripTags(e.target.value).slice(0, CLIENT_MAX))}
              maxLength={CLIENT_MAX}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              placeholder="e.g. Acme Corp"
            />
          </div>

          {/* Tax rate */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Tax Rate (%)
            </label>
            <input
              type="number"
              value={taxRate}
              onChange={(e) => setTaxRate(e.target.value)}
              onKeyDown={(e) => { if (["e", "E", "+", "-"].includes(e.key)) e.preventDefault(); }}
              min="0"
              max="100"
              step="0.1"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>

          {/* Line items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-700">
                Line Items <span className="text-red-500">*</span>
                <span className="ml-1 font-normal text-gray-400">({items.length}/{ITEMS_MAX})</span>
              </label>
              <button
                type="button"
                onClick={addItem}
                disabled={items.length >= ITEMS_MAX}
                className="text-xs text-gray-500 hover:text-gray-900 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
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
                    onChange={(e) => updateItem(idx, "description", stripTags(e.target.value).slice(0, DESC_MAX))}
                    maxLength={DESC_MAX}
                    placeholder="Description"
                    className="col-span-6 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                  <input
                    type="number"
                    inputMode="numeric"
                    value={item.quantity}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^0-9]/g, "");
                      updateItem(idx, "quantity", v);
                    }}
                    onKeyDown={(e) => { if (["e", "E", "+", "-", ".", ","].includes(e.key)) e.preventDefault(); }}
                    min="1"
                    step="1"
                    placeholder="Qty"
                    className="col-span-2 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                  <div className="col-span-3 flex items-center border border-gray-200 rounded-lg focus-within:ring-2 focus-within:ring-gray-900 overflow-hidden">
                    <span className="px-2 text-sm text-gray-400 bg-gray-50 border-r border-gray-200 select-none">€</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={item.unitPrice}
                      onChange={(e) => updateItem(idx, "unitPrice", e.target.value)}
                      onKeyDown={(e) => { if (["e", "E", "+", "-"].includes(e.key)) e.preventDefault(); }}
                      min="0"
                      step="0.01"
                      placeholder="0.00"
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
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-gray-700">Notes</label>
              <span className={`text-xs ${notes.length >= NOTES_MAX ? "text-red-500" : "text-gray-400"}`}>
                {notes.length}/{NOTES_MAX}
              </span>
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(stripTags(e.target.value).slice(0, NOTES_MAX))}
              rows={3}
              maxLength={NOTES_MAX}
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
