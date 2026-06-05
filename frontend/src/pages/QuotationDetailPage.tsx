import { useQuery } from "@apollo/client/react";
import { QUOTATION_QUERY } from "../graphql/queries";
import AIInsightCard from "../components/AIInsightCard";

interface QuotationItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  sortOrder: number;
}

interface QuotationDetail {
  id: string;
  quotationNumber: string;
  title: string;
  status: string;
  notes: string | null;
  taxRate: number;
  subtotal: number;
  taxAmount: number;
  total: number;
  validUntil: string | null;
  createdAt: string;
  client: {
    name: string;
    company: string;
    email: string;
    city: string | null;
    country: string | null;
  };
  createdBy: {
    name: string;
    email: string;
  };
  items: QuotationItem[];
}

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-600",
  SENT: "bg-blue-50 text-blue-600",
  APPROVED: "bg-green-50 text-green-600",
  REJECTED: "bg-red-50 text-red-600",
  EXPIRED: "bg-yellow-50 text-yellow-600",
};

interface Props {
  id: string;
  onBack: () => void;
}

export default function QuotationDetailPage({ id, onBack }: Readonly<Props>) {
  const { data, loading, error } = useQuery<{ quotation: QuotationDetail }>(
    QUOTATION_QUERY,
    { variables: { id } },
  );

  if (loading)
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-400 text-sm">Loading...</p>
      </div>
    );

  if (error)
    return (
      <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">
        Failed to load quotation
      </div>
    );

  const q = data?.quotation;
  if (!q) return null;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-2 mb-6 text-sm">
        <button
          onClick={onBack}
          className="text-gray-400 hover:text-gray-900 transition-colors"
        >
          Quotations
        </button>
        <span className="text-gray-300">/</span>
        <span className="text-gray-900 font-medium">{q.title}</span>
        <span
          className={`inline-flex text-xs font-medium px-2 py-1 rounded-full ${STATUS_STYLES[q.status] ?? "bg-gray-100 text-gray-600"}`}
        >
          {q.status}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Left — main content */}
        <div className="col-span-2 space-y-6">
          {/* Line items */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h3 className="text-sm font-medium text-gray-900">Line Items</h3>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-50">
                  <th className="text-left text-xs font-medium text-gray-400 px-6 py-3">
                    Description
                  </th>
                  <th className="text-right text-xs font-medium text-gray-400 px-6 py-3">
                    Qty
                  </th>
                  <th className="text-right text-xs font-medium text-gray-400 px-6 py-3">
                    Unit Price
                  </th>
                  <th className="text-right text-xs font-medium text-gray-400 px-6 py-3">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {q.items
                  .slice()
                  .sort((a, b) => a.sortOrder - b.sortOrder)
                  .map((item) => (
                    <tr key={item.id}>
                      <td className="px-6 py-3 text-sm text-gray-900">
                        {item.description}
                      </td>
                      <td className="px-6 py-3 text-sm text-gray-500 text-right">
                        {item.quantity}
                      </td>
                      <td className="px-6 py-3 text-sm text-gray-500 text-right">
                        €{item.unitPrice.toLocaleString()}
                      </td>
                      <td className="px-6 py-3 text-sm font-medium text-gray-900 text-right">
                        €{item.lineTotal.toLocaleString()}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>

            {/* Totals */}
            <div className="px-6 py-4 border-t border-gray-100 space-y-2">
              <div className="flex justify-between text-sm text-gray-500">
                <span>Subtotal</span>
                <span>€{q.subtotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-500">
                <span>Tax ({q.taxRate}%)</span>
                <span>€{q.taxAmount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm font-semibold text-gray-900 pt-2 border-t border-gray-100">
                <span>Total</span>
                <span>€{q.total.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          {q.notes && (
            <div className="bg-white rounded-xl border border-gray-100 p-6">
              <h3 className="text-sm font-medium text-gray-900 mb-2">Notes</h3>
              <p className="text-sm text-gray-500">{q.notes}</p>
            </div>
          )}
        </div>

        {/* Right — metadata */}
        <div className="space-y-4">
          {/* Quotation info */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h3 className="text-sm font-medium text-gray-900 mb-4">Details</h3>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-gray-400">Number</p>
                <p className="text-sm font-mono text-gray-700">
                  {q.quotationNumber}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Created</p>
                <p className="text-sm text-gray-700">
                  {new Date(q.createdAt).toLocaleDateString("en-DE")}
                </p>
              </div>
              {q.validUntil && (
                <div>
                  <p className="text-xs text-gray-400">Valid Until</p>
                  <p className="text-sm text-gray-700">
                    {new Date(q.validUntil).toLocaleDateString("en-DE")}
                  </p>
                </div>
              )}
              <div>
                <p className="text-xs text-gray-400">Created By</p>
                <p className="text-sm text-gray-700">{q.createdBy.name}</p>
              </div>
            </div>
          </div>

          {/* Client info */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h3 className="text-sm font-medium text-gray-900 mb-4">Client</h3>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-gray-400">Name</p>
                <p className="text-sm text-gray-700">{q.client.name}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Company</p>
                <p className="text-sm text-gray-700">{q.client.company}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Email</p>
                <p className="text-sm text-gray-700">{q.client.email}</p>
              </div>
              {(q.client.city || q.client.country) && (
                <div>
                  <p className="text-xs text-gray-400">Location</p>
                  <p className="text-sm text-gray-700">
                    {[q.client.city, q.client.country]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                </div>
              )}
            </div>
          </div>
          <AIInsightCard quotationId={id} />
        </div>
      </div>
    </div>
  );
}
