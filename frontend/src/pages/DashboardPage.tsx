import { useState, useMemo } from "react";
import { useQuery } from "@apollo/client/react";
import { DASHBOARD_STATS_QUERY } from "../graphql/queries";
import { useAuth } from "../hooks/useAuth";

interface TrendIndicator {
  delta: number;
  pct: number;
  direction: "up" | "down" | "flat";
}

interface DashboardStats {
  totalQuotations: number;
  totalSent: number;
  totalApproved: number;
  totalRejected: number;
  conversionRate: number;
  totalPipelineValue: number;
  totalApprovedValue: number;
  totalQuotationsTrend?: TrendIndicator | null;
  conversionRateTrend?: TrendIndicator | null;
  totalPipelineValueTrend?: TrendIndicator | null;
  totalApprovedValueTrend?: TrendIndicator | null;
}

type Period = "month" | "30d" | "90d" | "all";

const PERIOD_LABELS: Record<Period, string> = {
  month: "This month",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  all: "All time",
};

function periodToRange(p: Period): { from?: string; to?: string } {
  const now = new Date();
  if (p === "all") return {};
  if (p === "month") {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: from.toISOString(), to: now.toISOString() };
  }
  const days = p === "30d" ? 30 : 90;
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: now.toISOString() };
}

interface TrendBadgeProps {
  trend?: TrendIndicator | null;
  invertColor?: boolean;
}

function TrendBadge({ trend, invertColor = false }: Readonly<TrendBadgeProps>) {
  if (!trend) return null;
  const isPositive = trend.direction === "up";
  const isFlat = trend.direction === "flat";

  const color = isFlat
    ? "text-gray-400"
    : (isPositive && !invertColor) || (!isPositive && invertColor)
      ? "text-green-600"
      : "text-red-500";

  const arrow = isFlat ? "→" : isPositive ? "↑" : "↓";
  const label = isFlat ? "no change" : `${Math.abs(trend.pct)}% vs prev period`;

  return (
    <span className={`text-xs font-medium ${color}`}>
      {arrow} {label}
    </span>
  );
}

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  alert?: boolean;
  trend?: TrendIndicator | null;
  invertTrendColor?: boolean;
}

function StatCard({
  label,
  value,
  sub,
  alert,
  trend,
  invertTrendColor,
}: Readonly<StatCardProps>) {
  return (
    <div
      className={`bg-white rounded-xl border p-6 ${alert ? "border-amber-300 bg-amber-50" : "border-gray-100"}`}
    >
      <p className="text-sm text-gray-500 mb-1">{label}</p>
      <p
        className={`text-2xl font-semibold ${alert ? "text-amber-600" : "text-gray-900"}`}
      >
        {value}
      </p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
      <div className="mt-2 min-h-[16px]">
        <TrendBadge trend={trend} invertColor={invertTrendColor} />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const isManager = user?.role === "SALES_MANAGER";
  const [period, setPeriod] = useState<Period>("all");

  const range = useMemo(() => periodToRange(period), [period]);

  const { data, loading, error } = useQuery<{
    dashboardStats: DashboardStats;
  }>(DASHBOARD_STATS_QUERY, {
    skip: !isManager,
    variables: period === "all" ? {} : { range },
  });

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
      {/* Header + period selector */}
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <h2 className="text-xl font-semibold text-gray-900">Dashboard</h2>
        <div className="flex gap-1 rounded-lg border border-gray-200 p-1 bg-gray-50">
          {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                period === p
                  ? "bg-white text-gray-900 shadow-sm border border-gray-200"
                  : "text-gray-500 hover:text-gray-900"
              }`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {period !== "all" && (
        <p className="text-xs text-gray-400 mb-4 -mt-4">
          Trend indicators compare to the previous equivalent period.
        </p>
      )}

      <div className="grid grid-cols-2 gap-4 mb-6 lg:grid-cols-4">
        <StatCard
          label="Total Quotations"
          value={stats?.totalQuotations ?? 0}
          trend={stats?.totalQuotationsTrend}
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
          trend={stats?.conversionRateTrend}
        />
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4 lg:grid-cols-3">
        <StatCard
          label="Pipeline Value"
          value={`€${(stats?.totalPipelineValue ?? 0).toLocaleString()}`}
          sub="Open quotations"
          trend={stats?.totalPipelineValueTrend}
        />
        <StatCard
          label="Approved Value"
          value={`€${(stats?.totalApprovedValue ?? 0).toLocaleString()}`}
          sub="Won deals"
          trend={stats?.totalApprovedValueTrend}
        />
      </div>
    </div>
  );
}
