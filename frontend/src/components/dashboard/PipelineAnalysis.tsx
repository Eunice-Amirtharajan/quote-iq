import { useMemo, useState } from "react";
import { useQuery } from "@apollo/client/react";
import {
  DASHBOARD_STATS_QUERY,
  DEAL_VELOCITY_QUERY,
  QUARTERLY_HISTORY_QUERY,
  REP_DEAL_SIZE_WIN_RATES_QUERY,
} from "../../graphql/queries";
import { useAuth } from "../../hooks/useAuth";
import Panel from "./Panel";
import PeriodSelector from "./PeriodSelector";
import WinRateHeatmap from "./WinRateHeatmap";
import DealVelocityTable from "./DealVelocityTable";
import QuarterlyHistoryTable from "./QuarterlyHistoryTable";
import { PERIOD_LABELS, periodToRange, type Period } from "./period";
import {
  stageConversion,
  type DashboardStats,
  type DealVelocity,
  type QuarterStats,
  type RepDealSizeWinRates,
} from "./analytics";

const HEATMAP_PAGE_SIZE = 5;

/**
 * Deeper pipeline analysis for the Win/Loss page: which reps win which deal sizes,
 * how long each stage takes, and quarter-on-quarter history. These answer
 * occasional review questions, so they live here rather than on the dashboard.
 * Client concentration is not a panel: the dashboard warns when one client
 * reaches the risk threshold, which is the only case that needs attention.
 */
export default function PipelineAnalysis() {
  const { user } = useAuth();
  const isManager = user?.role === "SALES_MANAGER";
  const [period, setPeriod] = useState<Period>("all");
  const [heatmapOffset, setHeatmapOffset] = useState(0);

  const range = useMemo(() => periodToRange(period), [period]);
  const rangeVariables = period === "all" ? {} : { range };
  const periodLabel = PERIOD_LABELS[period].toLowerCase();

  const stats = useQuery<{ dashboardStats: DashboardStats }>(DASHBOARD_STATS_QUERY, {
    skip: !isManager,
    variables: rangeVariables,
  });
  const velocity = useQuery<{ dealVelocity: DealVelocity[] }>(DEAL_VELOCITY_QUERY, {
    skip: !isManager,
    variables: rangeVariables,
  });
  const quarters = useQuery<{ quarterlyHistory: QuarterStats[] }>(QUARTERLY_HISTORY_QUERY, {
    skip: !isManager,
  });
  const heatmap = useQuery<{ repDealSizeWinRates: RepDealSizeWinRates }>(REP_DEAL_SIZE_WIN_RATES_QUERY, {
    skip: !isManager,
    variables: { ...rangeVariables, offset: heatmapOffset, limit: HEATMAP_PAGE_SIZE },
  });

  if (!isManager) return null;

  const s = (stats.data ?? stats.previousData)?.dashboardStats;
  const velocityRows = (velocity.data ?? velocity.previousData)?.dealVelocity;
  const quarterRows = quarters.data?.quarterlyHistory;
  const heatmapData = (heatmap.data ?? heatmap.previousData)?.repDealSizeWinRates;
  const conversion = s ? stageConversion(s) : null;

  const changePeriod = (next: Period) => {
    setPeriod(next);
    setHeatmapOffset(0); // a new period can have fewer reps — start from the first page
  };

  return (
    <section aria-label="Pipeline analysis" className="font-dash space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap border-t border-gray-100 pt-8">
        <div>
          <h2 className="text-xl font-semibold leading-tight tracking-[-0.02em] text-dash-text">Pipeline Analysis</h2>
          <p className="mt-1 text-[13px] text-dash-muted">
            Win rates by deal size, cycle times and quarterly history · {periodLabel}
          </p>
          {/* The old funnel's numbers, as one line — every count is already in the KPIs */}
          {conversion && (
            <p aria-label="Stage conversion" className="mt-2 font-dash-mono text-xs text-dash-muted">
              <span className="text-dash-text">{conversion.sentOfCreated}</span> of quotes are sent ·{" "}
              <span className="text-dash-text">{conversion.approvedOfSent}</span> of sent are approved ·{" "}
              <span className="text-dash-text">{conversion.rejectedOfSent}</span> rejected ·{" "}
              <span className="text-dash-text">{conversion.openOfSent}</span> awaiting a decision
            </p>
          )}
        </div>
        <PeriodSelector value={period} onChange={changePeriod} label="Analysis period" />
      </div>

      <Panel
        title="Win Rate by Deal Size"
        meta={`per rep vs team average · ${periodLabel}`}
        loading={heatmap.loading}
        error={heatmap.error}
        hasData={!!heatmapData}
        skeletonHeight={300}
      >
        {heatmapData && <WinRateHeatmap data={heatmapData} onPageChange={setHeatmapOffset} />}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2 items-start">
        <Panel
          title="Deal Velocity"
          meta={`avg days per stage · ${periodLabel}`}
          loading={velocity.loading}
          error={velocity.error}
          hasData={!!velocityRows}
          skeletonHeight={200}
        >
          <DealVelocityTable rows={velocityRows ?? []} />
        </Panel>
        {/* Always the last 4 quarters — not affected by the period selector */}
        <Panel
          title="Quarter-on-Quarter"
          meta="last 4 quarters · vs previous quarter"
          loading={quarters.loading}
          error={quarters.error}
          hasData={!!quarterRows}
          skeletonHeight={200}
        >
          {quarterRows && <QuarterlyHistoryTable quarters={quarterRows} />}
        </Panel>
      </div>
    </section>
  );
}
