import { useState, useRef } from "react";
import { useQuery } from "@apollo/client/react";
import { QUOTATIONS_QUERY } from "../graphql/queries";
import { useAuth } from "../hooks/useAuth";
import CreateQuotationModal from "../components/CreateQuotationModal";

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
};

const ALL_STATUSES = ["DRAFT", "SENT", "APPROVED", "REJECTED"];

export default function QuotationsPage({ onSelect }: Readonly<Props>) {
  const { user } = useAuth();
  const [showCreate, setShowCreate] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [searchText, setSearchText] = useState<string>("");
  const [committedSearch, setCommittedSearch] = useState<string>("");
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = (value: string) => {
    setSearchText(value);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => setCommittedSearch(value), 400);
  };

  const clearSearch = () => {
    setSearchText("");
    setCommittedSearch("");
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
  };

  const filter =
    statusFilter || committedSearch
      ? {
          ...(statusFilter ? { status: statusFilter } : {}),
          ...(committedSearch ? { search: committedSearch } : {}),
        }
      : undefined;

  const { data, loading, error } = useQuery<{ quotations: Quotation[] }>(
    QUOTATIONS_QUERY,
    { variables: { filter } },
  );

  const quotations = data?.quotations ?? [];
  const canCreate = user?.role === "SALES_REP" || user?.role === "SALES_MANAGER" || user?.role === "ADMIN";

  return (
    <>
      {showCreate && (
        <CreateQuotationModal
          onClose={() => setShowCreate(false)}
          onCreated={(id) => {
            setShowCreate(false);
            onSelect(id);
          }}
        />
      )}

      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Quotations</h2>
            <span className="text-sm text-gray-400">
              {loading ? "Loading..." : `${quotations.length} total`}
            </span>
          </div>
          {canCreate && (
            <button
              onClick={() => setShowCreate(true)}
              className="px-4 py-2 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              New Quotation
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 mb-6">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Search by title, number, or client..."
              value={searchText}
              onChange={(e) => handleSearchChange(e.target.value)}
              maxLength={100}
              className="w-full px-3 py-2 pr-8 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300"
            />
            {searchText && (
              <button
                onClick={clearSearch}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                ×
              </button>
            )}
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300 bg-white"
          >
            <option value="">All statuses</option>
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        {error ? (
          <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">
            Failed to load quotations
          </div>
        ) : loading ? (
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  {["Number", "Title", "Client", "Status", "Total", "Created On"].map((h) => (
                    <th key={h} className="text-left text-xs font-medium text-gray-400 px-6 py-3">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    {Array.from({ length: 6 }).map((__, j) => (
                      <td key={j} className="px-6 py-4">
                        <div className="h-4 bg-gray-100 rounded animate-pulse w-24" />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : quotations.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
            <p className="text-gray-400 text-sm">
              {filter ? "No quotations match your filter" : "No quotations yet"}
            </p>
            {!filter && canCreate && (
              <button
                onClick={() => setShowCreate(true)}
                className="mt-4 px-4 py-2 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                Create your first quotation
              </button>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left text-xs font-medium text-gray-400 px-6 py-3">Number</th>
                  <th className="text-left text-xs font-medium text-gray-400 px-6 py-3">Title</th>
                  <th className="text-left text-xs font-medium text-gray-400 px-6 py-3">Client</th>
                  <th className="text-left text-xs font-medium text-gray-400 px-6 py-3">Status</th>
                  <th className="text-right text-xs font-medium text-gray-400 px-6 py-3">Total</th>
                  <th className="text-left text-xs font-medium text-gray-400 px-6 py-3">Date</th>
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
                      <p className="text-sm font-medium text-gray-900">{q.title}</p>
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
    </>
  );
}
