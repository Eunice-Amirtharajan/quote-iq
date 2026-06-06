import { useQuery } from "@apollo/client/react";
import { WIN_LOSS_ANALYSIS_QUERY } from "../graphql/queries";

interface RepStat {
  repName: string;
  sent: number;
  approved: number;
  rejected: number;
  approvalRate: number;
}

interface BucketStat {
  bucket: string;
  total: number;
  approved: number;
  approvalRate: number;
}

interface WinLossStats {
  approvalRate: number;
  avgApprovedDeal: number;
  avgRejectedDeal: number;
  byRep: RepStat[];
  byDealSize: BucketStat[];
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

export default function WinLossPage() {
  const { data, loading, error } =
    useQuery<{ winLossAnalysis: WinLossStats }>(WIN_LOSS_ANALYSIS_QUERY);

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
          <table className="w-full">
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
              {stats.byRep.map((r) => (
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
        )}
      </div>

      {/* By deal size */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-sm font-medium text-gray-900">By Deal Size</h3>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-50">
              {["Bucket", "Total", "Approved", "Win rate"].map((h) => (
                <th
                  key={h}
                  className="text-left text-xs font-medium text-gray-400 px-6 py-3"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {stats.byDealSize.map((b) => (
              <tr key={b.bucket}>
                <td className="px-6 py-3 text-sm font-medium text-gray-900">
                  {b.bucket}
                </td>
                <td className="px-6 py-3 text-sm text-gray-500">{b.total}</td>
                <td className="px-6 py-3 text-sm text-green-600">
                  {b.approved}
                </td>
                <td className="px-6 py-3 text-sm font-medium text-gray-900">
                  {b.approvalRate}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
