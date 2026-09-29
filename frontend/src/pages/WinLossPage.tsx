import { useState } from "react";
import { useQuery } from "@apollo/client/react";
import { WIN_LOSS_ANALYSIS_QUERY } from "../graphql/queries";
import PipelineAnalysis from "../components/dashboard/PipelineAnalysis";

interface RepStat {
  repName: string;
  sent: number;
  approved: number;
  rejected: number;
  approvalRate: number;
}

interface WinLossStats {
  approvalRate: number;
  avgApprovedDeal: number;
  avgRejectedDeal: number;
  byRep: RepStat[];
}

function StatCard({
  label,
  value,
}: Readonly<{ label: string; value: string }>) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className="text-2xl font-semibold text-gray-900">{value}</p>
    </div>
  );
}

/** Rows per page in the By Sales Rep table */
const REP_PAGE_SIZE = 5;

export default function WinLossPage() {
  const { data, loading, error } =
    useQuery<{ winLossAnalysis: WinLossStats }>(WIN_LOSS_ANALYSIS_QUERY);
  // The per-rep rows arrive in one cached aggregate, so paging is client-side:
  // the database work is the same however many rows are shown
  const [repPage, setRepPage] = useState(0);

  if (loading)
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-400 text-sm">Loading…</p>
      </div>
    );

  if (error)
    return (
      <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">
        Failed to load win/loss analysis
      </div>
    );

  const stats = data?.winLossAnalysis;
  if (!stats) return null;

  const repPages = Math.max(1, Math.ceil(stats.byRep.length / REP_PAGE_SIZE));
  const currentRepPage = Math.min(repPage, repPages - 1);
  const visibleReps = stats.byRep.slice(currentRepPage * REP_PAGE_SIZE, (currentRepPage + 1) * REP_PAGE_SIZE);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Win/Loss Analysis</h2>
        <p className="text-sm text-gray-400 mt-1">
          Approval patterns across all quotations
        </p>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard
          label="Overall approval rate"
          value={`${stats.approvalRate}%`}
        />
        <StatCard
          label="Avg approved deal"
          value={`€${stats.avgApprovedDeal.toLocaleString()}`}
        />
        <StatCard
          label="Avg rejected deal"
          value={`€${stats.avgRejectedDeal.toLocaleString()}`}
        />
      </div>

      {/* By rep */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-sm font-medium text-gray-900">By Sales Rep</h3>
        </div>
        {stats.byRep.length === 0 ? (
          <p className="px-6 py-8 text-sm text-gray-400 text-center">
            No data yet
          </p>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-115">
            <thead>
              <tr className="border-b border-gray-50">
                {["Rep", "Sent", "Approved", "Rejected", "Win rate"].map(
                  (h) => (
                    <th
                      key={h}
                      className="text-left text-xs font-medium text-gray-400 px-6 py-3"
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {visibleReps.map((r) => (
                <tr key={r.repName}>
                  <td className="px-6 py-3 text-sm font-medium text-gray-900">
                    {r.repName}
                  </td>
                  <td className="px-6 py-3 text-sm text-gray-500">{r.sent}</td>
                  <td className="px-6 py-3 text-sm text-green-600">
                    {r.approved}
                  </td>
                  <td className="px-6 py-3 text-sm text-red-500">
                    {r.rejected}
                  </td>
                  <td className="px-6 py-3 text-sm font-medium text-gray-900">
                    {r.approvalRate}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
        {repPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-100 px-6 py-3 text-sm text-gray-500">
            <span className="text-xs">
              Showing {currentRepPage * REP_PAGE_SIZE + 1}–
              {currentRepPage * REP_PAGE_SIZE + visibleReps.length} of {stats.byRep.length} reps
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setRepPage(currentRepPage - 1)}
                disabled={currentRepPage === 0}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Previous
              </button>
              <span className="text-xs">
                Page {currentRepPage + 1} of {repPages}
              </span>
              <button
                type="button"
                onClick={() => setRepPage(currentRepPage + 1)}
                disabled={currentRepPage >= repPages - 1}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Win rate by deal size, cycle times, concentration and QoQ. The by-deal-size
          breakdown is now per rep in the Pipeline Analysis heatmap (team row = old table). */}
      <PipelineAnalysis />
    </div>
  );
}
