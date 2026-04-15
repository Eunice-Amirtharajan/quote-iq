import { useQuery } from "@apollo/client/react";
import { QUOTATIONS_QUERY } from "../graphql/queries";

interface Quotation {
  id: string;
  quotationNumber: string;
  title: string;
  status: string;
  total: number;
  createdAt: string;
  client: {
    name: string;
    company: string;
  };
}
interface Props {
  onSelect: (id: string) => void;
}
const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-600",
  SENT: "bg-blue-50 text-blue-600",
  APPROVED: "bg-green-50 text-green-600",
  REJECTED: "bg-red-50 text-red-600",
  EXPIRED: "bg-yellow-50 text-yellow-600",
};

export default function QuotationsPage({ onSelect }: Props) {
  const { data, loading, error } = useQuery<{ quotations: Quotation[] }>(
    QUOTATIONS_QUERY,
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
        Failed to load quotations
      </div>
    );

  const quotations = data?.quotations ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Quotations</h2>
        <span className="text-sm text-gray-400">{quotations.length} total</span>
      </div>

      {quotations.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <p className="text-gray-400 text-sm">No quotations yet</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left text-xs font-medium text-gray-400 px-6 py-3">
                  Number
                </th>
                <th className="text-left text-xs font-medium text-gray-400 px-6 py-3">
                  Title
                </th>
                <th className="text-left text-xs font-medium text-gray-400 px-6 py-3">
                  Client
                </th>
                <th className="text-left text-xs font-medium text-gray-400 px-6 py-3">
                  Status
                </th>
                <th className="text-right text-xs font-medium text-gray-400 px-6 py-3">
                  Total
                </th>
                <th className="text-left text-xs font-medium text-gray-400 px-6 py-3">
                  Date
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {quotations.map((q) => (
                <tr
                  key={q.id}
                  onClick={() => onSelect(q.id)}
                  className="hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  <td className="px-6 py-4 text-sm font-mono text-gray-500">
                    {q.quotationNumber}
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm font-medium text-gray-900">
                      {q.title}
                    </p>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-gray-900">{q.client.name}</p>
                    <p className="text-xs text-gray-400">{q.client.company}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex text-xs font-medium px-2 py-1 rounded-full ${STATUS_STYLES[q.status] ?? "bg-gray-100 text-gray-600"}`}
                    >
                      {q.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right text-sm font-medium text-gray-900">
                    €{q.total.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-400">
                    {new Date(q.createdAt).toLocaleDateString("en-DE")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
