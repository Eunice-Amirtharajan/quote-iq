import { useParams } from "react-router-dom";
import { QUOTATION_BY_TOKEN_QUERY } from "../graphql/queries";
import { useQuery } from "@apollo/client/react";

interface QuotationItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  sortOrder: number;
}

interface PublicQuotation {
  quotationNumber: string;
  title: string;
  status: string;
  notes: string | null;
  taxRate: number;
  subtotal: number;
  taxAmount: number;
  total: number;
  clientName: string;
  items: QuotationItem[];
}

export default function PublicQuotePage() {
  const { token } = useParams<{ token: string }>();
  const { data, loading, error } = useQuery<{
    quotationByToken: PublicQuotation;
  }>(QUOTATION_BY_TOKEN_QUERY, {
    variables: { token },
    skip: !token,
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-400 text-sm">Loading...</p>
      </div>
    );
  }

  if (error || !data?.quotationByToken) {
    return (
      <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">
        This quote link is invalid. Please contact the sales representative for
        assistance.
      </div>
    );
  }

  const quoteData = data.quotationByToken;
  const statusColors: Record<string, string> = {
    DRAFT: "bg-gray-100 text-gray-600",
    SENT: "bg-blue-50 text-blue-700",
    APPROVED: "bg-green-50 text-green-700",
    REJECTED: "bg-red-50 text-red-600",
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">

        {/* Header */}
        <div className="px-8 py-6 border-b border-gray-100">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-gray-400 mb-1">{quoteData.quotationNumber}</p>
              <h1 className="text-xl font-semibold text-gray-900">{quoteData.title}</h1>
              <p className="text-sm text-gray-500 mt-1">Prepared for {quoteData.clientName}</p>
            </div>
            <span className={`text-xs font-medium px-3 py-1 rounded-full ${statusColors[quoteData.status] ?? "bg-gray-100 text-gray-600"}`}>
              {quoteData.status}
            </span>
          </div>
        </div>

        {/* Line items */}
        <div className="px-8 py-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                <th className="pb-3 font-medium">Description</th>
                <th className="pb-3 font-medium text-right">Qty</th>
                <th className="pb-3 font-medium text-right">Unit Price</th>
                <th className="pb-3 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {[...quoteData.items]
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((item) => (
                <tr key={item.id} className="border-b border-gray-50">
                  <td className="py-3 text-gray-700">{item.description}</td>
                  <td className="py-3 text-gray-500 text-right">{item.quantity}</td>
                  <td className="py-3 text-gray-500 text-right">€{item.unitPrice.toLocaleString()}</td>
                  <td className="py-3 text-gray-900 font-medium text-right">€{item.lineTotal.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="px-8 py-6 bg-gray-50 border-t border-gray-100 space-y-2">
          <div className="flex justify-between text-sm text-gray-500">
            <span>Subtotal</span>
            <span>€{quoteData.subtotal.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-sm text-gray-500">
            <span>Tax ({quoteData.taxRate}%)</span>
            <span>€{quoteData.taxAmount.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-base font-semibold text-gray-900 pt-2 border-t border-gray-200">
            <span>Total</span>
            <span>€{quoteData.total.toLocaleString()}</span>
          </div>
        </div>

        {/* Notes */}
        {quoteData.notes && (
          <div className="px-8 py-5 border-t border-gray-100">
            <p className="text-xs font-medium text-gray-400 mb-1">Notes</p>
            <p className="text-sm text-gray-600">{quoteData.notes}</p>
          </div>
        )}

        {/* Footer */}
        <div className="px-8 py-4 border-t border-gray-100">
          <p className="text-xs text-gray-400 text-center">Powered by QuoteIQ</p>
        </div>
      </div>
    </div>
  );
}
