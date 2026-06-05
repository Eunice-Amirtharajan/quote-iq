import { useQuery } from "@apollo/client/react";
import { DASHBOARD_STATS_QUERY } from "../graphql/queries";
import { useAuth } from "../hooks/useAuth";

interface DashboardStats {
  totalQuotations: number;
  totalSent: number;
  totalApproved: number;
  totalRejected: number;
  conversionRate: number;
  totalPipelineValue: number;
  totalApprovedValue: number;
}

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  alert?: boolean;
}

function StatCard({ label, value, sub, alert }: Readonly<StatCardProps>) {
  return (
    <div className={`bg-white rounded-xl border p-6 ${alert ? "border-amber-300 bg-amber-50" : "border-gray-100"}`}>
      <p className="text-sm text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-semibold ${alert ? "text-amber-600" : "text-gray-900"}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { data, loading, error } = useQuery<{ dashboardStats: DashboardStats }>(
    DASHBOARD_STATS_QUERY,
    { skip: user?.role === "SALES_REP" },
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
        Failed to load dashboard stats
      </div>
    );

  const stats = data?.dashboardStats;

  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-900 mb-6">Dashboard</h2>

      <div className="grid grid-cols-2 gap-4 mb-6 lg:grid-cols-4">
        <StatCard
          label="Total Quotations"
          value={stats?.totalQuotations ?? 0}
        />
        <StatCard
          label="Sent"
          value={stats?.totalSent ?? 0}
          sub="Awaiting response"
        />
        <StatCard label="Approved" value={stats?.totalApproved ?? 0} />
        <StatCard
          label="Conversion Rate"
          value={`${stats?.conversionRate ?? 0}%`}
        />
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4 lg:grid-cols-3">
        <StatCard
          label="Pipeline Value"
          value={`€${(stats?.totalPipelineValue ?? 0).toLocaleString()}`}
          sub="Open quotations"
        />
        <StatCard
          label="Approved Value"
          value={`€${(stats?.totalApprovedValue ?? 0).toLocaleString()}`}
          sub="Won deals"
        />
      </div>
    </div>
  );
}
