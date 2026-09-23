import { useState, useRef, useEffect } from "react";
import { useQuery } from "@apollo/client/react";
import {
  QUOTATIONS_QUERY,
  SALES_REPS_QUERY,
  CONVERSION_SCORES_QUERY,
} from "../graphql/queries";
import { useAuth } from "../hooks/useAuth";
import CreateQuotationModal from "../components/CreateQuotationModal";

const PAGE_SIZE = 20;

interface Quotation {
  id: string;
  quotationNumber: string;
  title: string;
  client: { id: string; name: string };
  status: string;
  total: number;
  createdAt: string;
}

interface SalesRep {
  id: string;
  name: string;
}

interface ConversionScores {
  quotationId: string;
  score: number;
  label: string;
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
  const isManager = user?.role === "SALES_MANAGER";
  const [showCreate, setShowCreate] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [repFilter, setRepFilter] = useState<string>("");
  const [repSearch, setRepSearch] = useState<string>("");
  const [repOpen, setRepOpen] = useState(false);
  const repRef = useRef<HTMLDivElement>(null);
  const [searchText, setSearchText] = useState<string>("");
  const [committedSearch, setCommittedSearch] = useState<string>("");
  const [page, setPage] = useState(0);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (repRef.current && !repRef.current.contains(e.target as Node)) {
        setRepOpen(false);
        setRepSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSearchChange = (value: string) => {
    setSearchText(value);
    setPage(0);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => setCommittedSearch(value), 400);
  };

  const clearSearch = () => {
    setSearchText("");
    setCommittedSearch("");
    setPage(0);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
  };

  const filter =
    statusFilter || committedSearch || repFilter
      ? {
          ...(statusFilter ? { status: statusFilter } : {}),
          ...(committedSearch ? { search: committedSearch } : {}),
          ...(repFilter ? { repId: repFilter } : {}),
        }
      : undefined;

  const { data, loading, error, fetchMore } = useQuery<{
    quotations: Quotation[];
  }>(QUOTATIONS_QUERY, { variables: { take: PAGE_SIZE, skip: 0, filter } });

  const { data: repsData } = useQuery<{ salesReps: SalesRep[] }>(
    SALES_REPS_QUERY,
    { skip: !isManager },
  );

  const quotations = data?.quotations ?? [];
  const salesReps = repsData?.salesReps ?? [];
  const canCreate = user?.role === "SALES_REP" || isManager;
  const hasMore = quotations.length === PAGE_SIZE * (page + 1);
  const sentIds = quotations
    .filter((quote) => quote.status === "SENT")
    .map((quote) => quote.id);

  const conversionScoresData = useQuery<{ conversionScores: ConversionScores[] }>(
    CONVERSION_SCORES_QUERY,
    {
      variables: { quotationIds: sentIds },
      skip: !isManager || sentIds.length === 0,
    },
  );
  const scoreMap: Record<string, number> = {};
  if (conversionScoresData?.data?.conversionScores) {
    const scoreInfo = conversionScoresData?.data;
    for (const cs of scoreInfo.conversionScores) {
      scoreMap[cs.quotationId] = cs.score;
    }
  }

  const loadMore = () => {
    const nextPage = page + 1;
    fetchMore({
      variables: { take: PAGE_SIZE, skip: nextPage * PAGE_SIZE, filter },
    }).catch(() => {});
    setPage(nextPage);
  };

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
              type="button"
              onClick={() => setShowCreate(true)}
              className="px-4 py-2 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              New Quotation
            </button>
          )}
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-6">
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
                type="button"
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
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(0);
            }}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300 bg-white"
          >
            <option value="">All statuses</option>
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          {isManager && salesReps.length > 0 && (
            <div className="relative" ref={repRef}>
              <div className="flex items-center border border-gray-200 rounded-lg bg-white focus-within:ring-2 focus-within:ring-gray-300 overflow-hidden">
                <input
                  type="text"
                  value={
                    repOpen
                      ? repSearch
                      : repFilter
                        ? (salesReps.find((r) => r.id === repFilter)?.name ?? "")
                        : ""
                  }
                  placeholder={repFilter ? "" : "All reps"}
                  onChange={(e) => {
                    setRepSearch(e.target.value);
                    setRepOpen(true);
                  }}
                  onFocus={() => {
                    setRepSearch("");
                    setRepOpen(true);
                  }}
                  className="px-3 py-2 text-sm w-36 outline-none bg-transparent placeholder-gray-400"
                />
                {repFilter && (
                  <button
                    type="button"
                    onClick={() => {
                      setRepFilter("");
                      setRepSearch("");
                      setRepOpen(false);
                      setPage(0);
                    }}
                    className="pr-2 text-gray-400 hover:text-gray-600 text-xs leading-none"
                    aria-label="Clear rep filter"
                  >
                    ✕
                  </button>
                )}
              </div>
              {repOpen && (
                <ul className="absolute z-20 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto text-sm">
                  {salesReps
                    .filter((r) =>
                      r.name.toLowerCase().includes(repSearch.toLowerCase()),
                    )
                    .map((r) => (
                      <li key={r.id}>
                        <button
                          type="button"
                          onMouseDown={() => {
                            setRepFilter(r.id);
                            setRepSearch("");
                            setRepOpen(false);
                            setPage(0);
                          }}
                          className={`w-full text-left px-3 py-2 hover:bg-gray-50 ${repFilter === r.id ? "font-medium text-gray-900" : "text-gray-700"}`}
                        >
                          {r.name}
                        </button>
                      </li>
                    ))}
                  {salesReps.filter((r) =>
                    r.name.toLowerCase().includes(repSearch.toLowerCase()),
                  ).length === 0 && (
                    <li className="px-3 py-2 text-gray-400">No match</li>
                  )}
                </ul>
              )}
            </div>
          )}
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">
            Failed to load quotations
          </div>
        )}
        {!error && loading && (
          <>
            {/* Desktop skeleton */}
            <div className="hidden md:block bg-white rounded-xl border border-gray-100 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    {[
                      "Number", "Title", "Client", "Status",
                      ...(isManager ? ["Win chance"] : []),
                      "Total", "Created On",
                    ].map((h) => (
                      <th key={h} className="text-left text-xs font-medium text-gray-400 px-6 py-3">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 3 }).map((_, i) => (
                    <tr key={`skeleton-row-${i}`} className="border-b border-gray-50">
                      {Array.from({ length: isManager ? 7 : 6 }).map((__, j) => (
                        <td key={`skeleton-cell-${i}-${j}`} className="px-6 py-4">
                          <div className="h-4 bg-gray-100 rounded animate-pulse w-24" />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Mobile skeleton */}
            <div className="md:hidden space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={`mobile-skeleton-${i}`} className="bg-white rounded-xl border border-gray-100 px-4 py-4">
                  <div className="flex justify-between mb-2">
                    <div className="h-4 bg-gray-100 rounded animate-pulse w-40" />
                    <div className="h-5 bg-gray-100 rounded-full animate-pulse w-16" />
                  </div>
                  <div className="flex justify-between">
                    <div className="h-3 bg-gray-100 rounded animate-pulse w-24" />
                    <div className="h-3 bg-gray-100 rounded animate-pulse w-16" />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        {!error && !loading && quotations.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
            <p className="text-gray-400 text-sm">
              {filter ? "No quotations match your filter" : "No quotations yet"}
            </p>
            {!filter && canCreate && (
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="mt-4 px-4 py-2 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                Create your first quotation
              </button>
            )}
          </div>
        )}
        {!error && !loading && quotations.length > 0 && (
          <>
            {/* Desktop table */}
            <div className="hidden md:block bg-white rounded-xl border border-gray-100 overflow-hidden">
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
                    {isManager && (
                      <th className="text-right text-xs font-medium text-gray-400 px-6 py-3">
                        Win chance
                      </th>
                    )}
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
                      <td className="px-6 py-4 max-w-50">
                        <p className="text-sm font-medium text-gray-900 truncate" title={q.title}>
                          {q.title}
                        </p>
                      </td>
                      <td className="px-6 py-4 max-w-40">
                        <p className="text-sm text-gray-900 truncate" title={q.client.name}>
                          {q.client.name}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex text-xs font-medium px-2 py-1 rounded-full ${STATUS_STYLES[q.status] ?? "bg-gray-100 text-gray-600"}`}>
                          {q.status}
                        </span>
                      </td>
                      {isManager && (
                        <td className="px-6 py-4 text-right">
                          {q.status === "SENT" ? (
                            <span className="text-sm text-gray-700">
                              {scoreMap[q.id] !== undefined ? `${scoreMap[q.id]}%` : "—"}
                            </span>
                          ) : (
                            <span className="text-gray-300 text-sm">—</span>
                          )}
                        </td>
                      )}
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

            {/* Mobile card list */}
            <div className="md:hidden space-y-3">
              {quotations.map((q) => (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => onSelect(q.id)}
                  className="w-full text-left bg-white rounded-xl border border-gray-100 px-4 py-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{q.title}</p>
                      <p className="text-xs font-mono text-gray-400 mt-0.5">{q.quotationNumber}</p>
                    </div>
                    <span className={`shrink-0 inline-flex text-xs font-medium px-2 py-1 rounded-full ${STATUS_STYLES[q.status] ?? "bg-gray-100 text-gray-600"}`}>
                      {q.status}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span className="truncate">{q.client.name}</span>
                    <div className="flex items-center gap-3 shrink-0 ml-2">
                      {isManager && q.status === "SENT" && scoreMap[q.id] !== undefined && (
                        <span className="text-gray-600">{scoreMap[q.id]}% win</span>
                      )}
                      <span className="font-medium text-gray-900">€{q.total.toLocaleString()}</span>
                      <span className="text-gray-400">{new Date(q.createdAt).toLocaleDateString("en-DE")}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
            {hasMore && (
              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loading}
                  className="px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-40"
                >
                  {loading ? "Loading…" : "Load more"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
