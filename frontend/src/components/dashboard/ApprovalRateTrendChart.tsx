import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CHART,
  DELTA_TEXT,
  MONO,
  deltaTone,
  formatMonth,
  formatPpChange,
  rateDomain,
  trendExtremes,
  type ApprovalRateMonth,
} from "./analytics";

interface TooltipProps {
  active?: boolean;
  payload?: { payload: ApprovalRateMonth }[];
}

function TrendTooltip({ active, payload }: Readonly<TooltipProps>) {
  const m = active ? payload?.[0]?.payload : undefined;
  if (!m) return null;
  return (
    <div className="rounded-lg border border-dash-border bg-white px-3 py-2 text-xs shadow-sm">
      <p className="font-medium text-dash-text">{formatMonth(m.month, true)}</p>
      <p className="text-dash-muted">
        {m.rate === null ? "No decisions" : `${m.rate}% approved`}
      </p>
      <p className="text-dash-muted">
        {m.approved} approved · {m.rejected} rejected · {m.sent} sent
      </p>
    </div>
  );
}

export default function ApprovalRateTrendChart({ months }: Readonly<{ months: ApprovalRateMonth[] }>) {
  if (months.every((m) => m.rate === null)) {
    return (
      <p className="px-5 py-8 text-sm text-dash-faint text-center">
        No quotations decided in the last 12 months
      </p>
    );
  }

  const data = months.map((m) => ({ ...m, label: formatMonth(m.month) }));
  const lastIndex = data.findLastIndex((m) => m.rate !== null);
  const { peak, trough, momPp } = trendExtremes(months);

  // Direct-label only the latest point; the axis and tooltip carry the rest
  const renderDot = (props: { cx?: number; cy?: number; index?: number; value?: unknown }) => {
    const { cx, cy, index } = props;
    if (index !== lastIndex || cx == null || cy == null) return <g key={`dot-${index}`} />;
    return (
      <g key="dot-last">
        <circle cx={cx} cy={cy} r={4} fill={CHART.series} stroke="#ffffff" strokeWidth={2} />
        <text x={cx - 8} y={cy - 8} textAnchor="end" fontSize={10} fontFamily={MONO} fill={CHART.series}>
          {data[lastIndex].rate}%
        </text>
      </g>
    );
  };

  return (
    <div>
      <div className="px-4 pt-4 pb-1">
        <ResponsiveContainer width="100%" height={140}>
          <AreaChart data={data} margin={{ top: 16, right: 10, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="approvalRateFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHART.series} stopOpacity={0.25} />
                <stop offset="100%" stopColor={CHART.series} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke={CHART.grid} strokeOpacity={0.6} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 10, fill: CHART.inkMuted, fontFamily: MONO }}
              minTickGap={2}
            />
            <YAxis
              domain={rateDomain(months.map((m) => m.rate))}
              tickFormatter={(v: number) => `${v}%`}
              tickCount={3}
              width={34}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 9, fill: CHART.inkMuted, fontFamily: MONO }}
            />
            <Tooltip content={<TrendTooltip />} cursor={{ stroke: CHART.axis }} />
            <Area
              type="linear"
              dataKey="rate"
              stroke={CHART.series}
              strokeWidth={2}
              fill="url(#approvalRateFill)"
              fillOpacity={1}
              connectNulls={false}
              isAnimationActive={false}
              dot={renderDot}
              activeDot={{ r: 4, stroke: "#ffffff", strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <dl className="flex gap-6 border-t border-dash-border px-5 py-3.5 font-dash-mono">
        <div>
          <dt className="mb-0.5 text-[11px] font-medium uppercase tracking-[0.06em] text-dash-faint">Peak</dt>
          <dd className="text-[13px] font-medium text-dash-pos">
            {peak ? `${formatMonth(peak.month)} · ${peak.rate}%` : "—"}
          </dd>
        </div>
        <div>
          <dt className="mb-0.5 text-[11px] font-medium uppercase tracking-[0.06em] text-dash-faint">Trough</dt>
          <dd className="text-[13px] font-medium text-dash-neg">
            {trough ? `${formatMonth(trough.month)} · ${trough.rate}%` : "—"}
          </dd>
        </div>
        <div>
          <dt className="mb-0.5 text-[11px] font-medium uppercase tracking-[0.06em] text-dash-faint">MoM</dt>
          <dd className={`text-[13px] font-medium ${DELTA_TEXT[deltaTone(momPp)]}`}>{formatPpChange(momPp)}</dd>
        </div>
      </dl>

      <table className="sr-only">
        <caption>Monthly approval rate</caption>
        <thead>
          <tr>
            <th>Month</th>
            <th>Approval rate</th>
          </tr>
        </thead>
        <tbody>
          {months.map((m) => (
            <tr key={m.month}>
              <td>{formatMonth(m.month, true)}</td>
              <td>{m.rate === null ? "No decisions" : `${m.rate}%`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
