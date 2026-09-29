import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@apollo/client/react";
import {
  APPROVAL_RATE_TREND_QUERY,
  CLIENT_CONCENTRATION_QUERY,
  DASHBOARD_STATS_QUERY,
  REP_PERFORMANCE_QUERY,
  STALE_QUOTATIONS_QUERY,
} from "../graphql/queries";
import { useAuth } from "../hooks/useAuth";
import Panel from "../components/dashboard/Panel";
import KpiTile, { DeltaPill } from "../components/dashboard/KpiTile";
import PeriodSelector from "../components/dashboard/PeriodSelector";
import RepPerformanceChart from "../components/dashboard/RepPerformanceChart";
import ApprovalRateTrendChart from "../components/dashboard/ApprovalRateTrendChart";
import StalePipelineTable from "../components/dashboard/StalePipelineTable";
import { PERIOD_LABELS, PREV_LABELS, periodToRange, type Period } from "../components/dashboard/period";
import {
  CHART,
  CONCENTRATION_RISK_SHARE,
  formatCurrency,
  formatCurrencyCompact,
  pctChange,
  type ApprovalRateMonth,
  type ClientConcentration,
  type DashboardStats,
  type RepPerformance,
  type StalePipeline,
  type TrendIndicator,
} from "../components/dashboard/analytics";

/** Reps listed individually in the Rep Performance panel; the rest are pooled */
const REPS_SHOWN = 5;

const KPI_ACCENTS = {
  pipeline: "#3b82f6",
  approval: "#10b981",
  dealSize: "#8b5cf6",
  stale: "#ea580c",
} as const;

/** Trend pill: "↑ 12.4% vs prev 90d", or percentage points for rates */
function TrendPill({
  trend,
  unit = "pct",
  suffix,
}: Readonly<{ trend?: TrendIndicator | null; unit?: "pct" | "pp"; suffix: string }>) {
  if (!trend) return null;
  if (trend.direction === "flat") return <DeltaPill tone="flat">→ no change {suffix}</DeltaPill>;
  const up = trend.direction === "up";
  const amount = unit === "pp" ? `${Math.abs(trend.delta)} pp` : `${Math.abs(trend.pct)}%`;
  return (
    <DeltaPill tone={up ? "up" : "down"}>
      {up ? "↑" : "↓"} {amount} {suffix}
    </DeltaPill>
  );
}

/**
 * "Total Pipeline" is open + approved value. The API returns a trend for each part,
 * so the combined trend is rebuilt from their previous-period values.
 */
function totalPipelineTrend(s: DashboardStats): TrendIndicator | null {
  const open = s.totalPipelineValueTrend;
  const won = s.totalApprovedValueTrend;
  if (!open || !won) return null;
  const current = s.totalPipelineValue + s.totalApprovedValue;
  const previous = s.totalPipelineValue - open.delta + (s.totalApprovedValue - won.delta);
  const pct = pctChange(current, previous);
  if (pct === null) return null;
  const delta = current - previous;
  let direction: TrendIndicator["direction"] = "flat";
  if (delta > 0) direction = "up";
  else if (delta < 0) direction = "down";
  return { delta, pct, direction };
}

/**
 * The manager's daily view: are we on track (KPIs), what needs chasing today
 * (stale pipeline), who needs help (reps) and which way conversion is heading
 * (trend). Deeper analysis — funnel, velocity, concentration, QoQ — lives on
 * the Win/Loss page.
 */
export default function DashboardPage() {
  const { user } = useAuth();
  const isManager = user?.role === "SALES_MANAGER";
  const [period, setPeriod] = useState<Period>("all");

  const range = useMemo(() => periodToRange(period), [period]);
  const rangeVariables = period === "all" ? {} : { range };
  const periodLabel = PERIOD_LABELS[period].toLowerCase();
  const prevLabel = PREV_LABELS[period];

  // One query per panel: independent loading, no waterfall. The trend and stale
  // panels are not tied to the period selector and never refetch on change.
  const stats = useQuery<{ dashboardStats: DashboardStats }>(DASHBOARD_STATS_QUERY, {
    skip: !isManager,
    variables: rangeVariables,
  });
  const reps = useQuery<{ repPerformance: RepPerformance[] }>(REP_PERFORMANCE_QUERY, {
    skip: !isManager,
    variables: { ...rangeVariables, limit: REPS_SHOWN },
  });
  const trend = useQuery<{ approvalRateTrend: ApprovalRateMonth[] }>(APPROVAL_RATE_TREND_QUERY, {
    skip: !isManager,
  });
  const stale = useQuery<{ staleQuotations: StalePipeline }>(STALE_QUOTATIONS_QUERY, {
    skip: !isManager,
  });
  // Only drives the concentration warning; the full breakdown is on Win/Loss
  const clients = useQuery<{ clientConcentration: ClientConcentration[] }>(CLIENT_CONCENTRATION_QUERY, {
    skip: !isManager,
    variables: rangeVariables,
  });

  if (!isManager) {
    return (
      <div className="font-dash">
        <h2 className="text-xl font-semibold tracking-[-0.02em] text-dash-text mb-2">Pipeline Intelligence</h2>
        <p className="text-sm text-dash-muted">Pipeline analytics are available to sales managers.</p>
      </div>
    );
  }

  // Keep showing the previous period's numbers while a new period loads
  const s = (stats.data ?? stats.previousData)?.dashboardStats;
  const repRows = (reps.data ?? reps.previousData)?.repPerformance;
  const trendMonths = trend.data?.approvalRateTrend;
  const stalePipeline = stale.data?.staleQuotations;
  const topClient = (clients.data ?? clients.previousData)?.clientConcentration[0];
  const concentrationRisk = topClient && topClient.shareOfTotal >= CONCENTRATION_RISK_SHARE ? topClient : undefined;

  const decided = (s?.totalApproved ?? 0) + (s?.totalRejected ?? 0);
  const dealSizeSub =
    s?.medianDealSize != null && s?.p90DealSize != null
      ? `median ${formatCurrency(s.medianDealSize)} · p90 ${formatCurrency(s.p90DealSize)}`
      : "no approved deals yet";

  return (
    <div className="font-dash space-y-6">
      {/* Header + period selector — scopes the KPI tiles and rep performance */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold leading-tight tracking-[-0.02em] text-dash-text">
            Pipeline Intelligence
          </h2>
          <p className="mt-1 text-[13px] text-dash-muted">
            {s ? `${s.totalQuotations.toLocaleString()} quotations · ${periodLabel}` : periodLabel}
          </p>
        </div>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      {/* Row 1 — are we on track? */}
      {stats.error && !s ? (
        <div className="rounded-lg bg-dash-neg-bg px-4 py-3 text-sm text-dash-neg">Failed to load dashboard stats</div>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiTile
            label="Total Pipeline"
            accent={KPI_ACCENTS.pipeline}
            value={formatCurrencyCompact((s?.totalPipelineValue ?? 0) + (s?.totalApprovedValue ?? 0))}
            sub={`${formatCurrencyCompact(s?.totalApprovedValue ?? 0)} approved · ${formatCurrencyCompact(
              s?.totalPipelineValue ?? 0,
            )} open`}
            loading={!s}
            pill={s && <TrendPill trend={totalPipelineTrend(s)} suffix={prevLabel} />}
          />
          <KpiTile
            label="Approval Rate"
            accent={KPI_ACCENTS.approval}
            value={`${s?.conversionRate ?? 0}%`}
            sub={`${(s?.totalApproved ?? 0).toLocaleString()} approved / ${decided.toLocaleString()} decided`}
            loading={!s}
            pill={<TrendPill trend={s?.conversionRateTrend} unit="pp" suffix={prevLabel} />}
          />
          <KpiTile
            label="Avg Deal Size"
            accent={KPI_ACCENTS.dealSize}
            value={formatCurrency(s?.avgDealSize ?? 0)}
            sub={dealSizeSub}
            loading={!s}
            pill={<TrendPill trend={s?.avgDealSizeTrend} suffix={prevLabel} />}
          />
          <KpiTile
            label="Stale Quotes"
            accent={KPI_ACCENTS.stale}
            value={(stalePipeline?.totalCount ?? 0).toLocaleString()}
            sub={`SENT · no response >${stalePipeline?.thresholdDays ?? 14} days`}
            loading={!stalePipeline && !stale.error}
            pill={
              stalePipeline && stalePipeline.totalCount > 0 ? (
                <DeltaPill tone="stale">{formatCurrencyCompact(stalePipeline.totalValue)} at risk</DeltaPill>
              ) : undefined
            }
          />
        </div>
      )}

      {/* Shown only when it matters — the full breakdown lives on Win/Loss */}
      {concentrationRisk && (
        <p
          role="status"
          className="flex flex-wrap items-center gap-2 rounded-lg border border-dash-warn/40 bg-dash-warn-bg px-4 py-2.5 text-[13px] text-dash-text"
        >
          <span aria-hidden="true" style={{ color: CHART.warning }}>
            ▲
          </span>
          <span>
            <span className="font-medium">Concentration risk:</span> {concentrationRisk.clientName} accounts for{" "}
            {concentrationRisk.shareOfTotal}% of approved revenue ({periodLabel}).
          </span>
          <Link to="/winloss" className="font-medium text-dash-accent hover:underline">
            See client concentration →
          </Link>
        </p>
      )}

      {/* Row 2 — what needs chasing today? */}
      <Panel
        title="Stale Pipeline"
        tone="stale"
        badge={
          stalePipeline && stalePipeline.totalCount > 0 ? (
            <span className="rounded-full border border-dash-stale-border bg-dash-stale-bg px-2 py-0.5 font-dash-mono text-[11px] font-medium text-dash-stale">
              {stalePipeline.totalCount.toLocaleString()} quotes
            </span>
          ) : undefined
        }
        meta={`SENT with no status change · threshold ${stalePipeline?.thresholdDays ?? 14} days`}
        loading={stale.loading}
        error={stale.error}
        hasData={!!stalePipeline}
        skeletonHeight={240}
      >
        {stalePipeline && <StalePipelineTable pipeline={stalePipeline} />}
      </Panel>

      {/* Row 3 — who needs help, and which way is conversion heading? */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] items-start">
        <Panel
          title="Rep Performance"
          meta={`approved revenue + win rate · ${periodLabel}`}
          loading={reps.loading}
          error={reps.error}
          hasData={!!repRows}
          skeletonHeight={220}
        >
          <RepPerformanceChart reps={repRows ?? []} />
        </Panel>
        <Panel
          title="Approval Rate Trend"
          meta="monthly · 12mo"
          loading={trend.loading}
          error={trend.error}
          hasData={!!trendMonths}
          skeletonHeight={200}
        >
          <ApprovalRateTrendChart months={trendMonths ?? []} />
        </Panel>
      </div>

      <p className="text-[12px] text-dash-muted">
        Funnel, deal velocity, client concentration and quarter-on-quarter history are on the{" "}
        <Link to="/winloss" className="font-medium text-dash-accent hover:underline">
          Win/Loss
        </Link>{" "}
        page.
      </p>
    </div>
  );
}
