import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  CHART,
  MONO,
  RANK_COLORS,
  formatCurrency,
  formatCurrencyCompact,
  truncate,
  type RepPerformance,
} from "./analytics";

const ROW_HEIGHT = 32;
const NAME_WIDTH = 124;
const STAT_WIDTH = 132;
// Recharts places right-axis ticks this far inside the axis area; the stat column
// right-aligns against the axis edge minus this inset so text is never clipped
const TICK_INSET = 16;

interface TooltipProps {
  active?: boolean;
  payload?: { payload: RepPerformance }[];
}

function RepTooltip({ active, payload }: Readonly<TooltipProps>) {
  const rep = active ? payload?.[0]?.payload : undefined;
  if (!rep) return null;
  return (
    <div className="rounded-lg border border-dash-border bg-white px-3 py-2 text-xs shadow-sm">
      <p className="font-medium text-dash-text">{rep.repName}</p>
      <p className="text-dash-muted">Approved revenue: {formatCurrency(rep.approvedRevenue)}</p>
      <p className="text-dash-muted">
        Win rate: {rep.winRate}% · {rep.totalApproved} of {rep.totalSent} sent
      </p>
    </div>
  );
}

interface TickProps {
  x?: number | string;
  y?: number | string;
  payload?: { value: string; index: number };
}

/** Left column: rank-coloured dot + rep name, as in the concept */
function NameTick({ x = 0, y = 0, payload }: Readonly<TickProps>) {
  const name = payload?.value ?? "";
  const shown = truncate(name, 17);
  const left = Number(x) - NAME_WIDTH + 8;
  return (
    <g>
      <circle cx={left + 3} cy={Number(y)} r={3} fill={RANK_COLORS[(payload?.index ?? 0) % RANK_COLORS.length]} />
      <text x={left + 12} y={Number(y)} dy="0.35em" fontSize={12} fill={CHART.inkSecondary}>
        {shown !== name && <title>{name}</title>}
        {shown}
      </text>
    </g>
  );
}

/** Right column: revenue, then "win rate · deals" underneath */
function StatTick({ x = 0, y = 0, payload, rows }: Readonly<TickProps & { rows: RepPerformance[] }>) {
  const rep = rows[payload?.index ?? 0];
  if (!rep) return null;
  const right = Number(x) + STAT_WIDTH - TICK_INSET;
  return (
    <g fontFamily={MONO}>
      <text x={right} y={Number(y) - 2} textAnchor="end" fontSize={12} fill={CHART.inkPrimary}>
        {formatCurrencyCompact(rep.approvedRevenue)}
      </text>
      <text x={right} y={Number(y) + 11} textAnchor="end" fontSize={10} fill={CHART.inkMuted}>
        {rep.winRate}% · {rep.totalApproved.toLocaleString()} deals
      </text>
    </g>
  );
}

export default function RepPerformanceChart({ reps }: Readonly<{ reps: RepPerformance[] }>) {
  const individual = reps.filter((r) => !r.isOthers);
  const others = reps.find((r) => r.isOthers);

  if (individual.length === 0) {
    return <p className="px-5 py-8 text-sm text-dash-faint text-center">No quotations sent in this period</p>;
  }

  const top = individual[0].approvedRevenue;

  return (
    <div className="px-5 pt-5 pb-4">
      <ResponsiveContainer width="100%" height={individual.length * ROW_HEIGHT + 8}>
        <BarChart data={individual} layout="vertical" margin={{ top: 4, right: 0, bottom: 4, left: 0 }}>
          {/* Top rep's bar spans ~88% of the track, as in the concept */}
          <XAxis type="number" hide domain={[0, top > 0 ? top / 0.88 : 1]} />
          <YAxis
            type="category"
            dataKey="repName"
            width={NAME_WIDTH}
            tickLine={false}
            axisLine={false}
            tick={<NameTick />}
          />
          <YAxis
            yAxisId="stats"
            orientation="right"
            type="category"
            dataKey="repName"
            width={STAT_WIDTH}
            tickLine={false}
            axisLine={false}
            tick={<StatTick rows={individual} />}
          />
          <Tooltip cursor={{ fill: CHART.track, opacity: 0.6 }} content={<RepTooltip />} />
          <Bar
            dataKey="approvedRevenue"
            radius={4}
            barSize={8}
            background={{ fill: CHART.track, radius: 4 }}
            isAnimationActive={false}
          >
            {individual.map((r, i) => (
              <Cell key={r.repId ?? r.repName} fill={RANK_COLORS[i % RANK_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {others && (
        <div
          className="mt-1.5 grid items-center gap-2.5"
          style={{ gridTemplateColumns: `${NAME_WIDTH - 8}px 1fr ${STAT_WIDTH - TICK_INSET + 4}px` }}
        >
          <span className="flex items-center gap-1.5 truncate text-xs text-dash-muted">
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: RANK_COLORS[5] }}
            />
            {others.repName}
          </span>
          <span aria-hidden="true" className="h-2 rounded bg-linear-to-r from-[#ddd6fe] to-dash-raised" />
          <span className="text-right font-dash-mono">
            <span className="block text-xs text-dash-text">{formatCurrencyCompact(others.approvedRevenue)}</span>
            <span className="block whitespace-nowrap text-[10px] text-dash-faint">avg {others.winRate}% win rate</span>
          </span>
        </div>
      )}
    </div>
  );
}
