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
  repName: string;
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
  const printedOn = new Date().toLocaleDateString("en-DE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return (
    <>
      <style>{`
        @media print {
          @page { margin: 20mm 16mm; }
          body { background: white !important; }
          .print-shell { background: white !important; padding: 0 !important; }
          .print-card {
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
            max-width: 100% !important;
          }
          .print-hide { display: none !important; }
          .print-totals { background: white !important; }
          .print-footer-screen { display: none !important; }
          .print-footer-print { display: flex !important; }
        }
        .print-footer-print { display: none; }
      `}</style>

      <div className="print-shell min-h-screen bg-gray-50 py-12 px-4">
        {/* Print button — hidden when printing */}
        <div className="print-hide max-w-2xl mx-auto mb-4 flex justify-end">
          <button
            type="button"
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6v-8z" />
            </svg>
            Save as PDF
          </button>
        </div>

        <div className="print-card max-w-2xl mx-auto bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">

          {/* Header */}
          <div className="px-8 py-6 border-b border-gray-100">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-gray-400 mb-1">{quoteData.quotationNumber}</p>
                <h1 className="text-xl font-semibold text-gray-900">{quoteData.title}</h1>
                <p className="text-sm text-gray-500 mt-1">Prepared for {quoteData.clientName}</p>
                {quoteData.repName && (
                  <p className="text-xs text-gray-400 mt-0.5">Prepared by {quoteData.repName}</p>
                )}
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
          <div className="print-totals px-8 py-6 bg-gray-50 border-t border-gray-100 space-y-2" style={{ pageBreakInside: "avoid" }}>
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
            <div className="px-8 py-5 border-t border-gray-100" style={{ pageBreakInside: "avoid" }}>
              <p className="text-xs font-medium text-gray-400 mb-1">Notes</p>
              <p className="text-sm text-gray-600">{quoteData.notes}</p>
            </div>
          )}

          {/* Footer — screen version */}
          <div className="print-footer-screen px-8 py-4 border-t border-gray-100">
            <p className="text-xs text-gray-400 text-center">Powered by QuoteIQ</p>
          </div>

          {/* Footer — print version */}
          <div className="print-footer-print px-8 py-4 border-t border-gray-100 flex items-center justify-between">
            <p className="text-xs text-gray-400">QuoteIQ · {quoteData.quotationNumber}</p>
            <p className="text-xs text-gray-400">Generated {printedOn}</p>
          </div>
        </div>
      </div>
    </>
  );
}
