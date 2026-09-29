import {
  DELTA_PILL,
  deltaTone,
  formatCurrencyCompact,
  formatMonth,
  pctChange,
  type QuarterStats,
} from "./analytics";

/** ISO bounds are UTC, so their first 7 chars are the quarter's first and last month */
function monthSpan(from: string, to: string): string {
  return `${formatMonth(from.slice(0, 7))} – ${formatMonth(to.slice(0, 7))}`;
}

/** "+14%" / "−2%" / "+3.7pp" — compact QoQ badge text */
function signed(value: number, unit: "%" | "pp"): string {
  const shown = unit === "%" ? Math.round(value) : Math.round(value * 10) / 10;
  if (shown === 0) return `0${unit}`;
  return `${shown > 0 ? "+" : "−"}${Math.abs(shown)}${unit}`;
}

function QoqPill({ value, unit }: Readonly<{ value: number | null; unit: "%" | "pp" }>) {
  if (value === null) return null;
  return (
    <span className={`ml-1.5 rounded-[3px] px-1 py-px font-dash-mono text-[10px] font-medium ${DELTA_PILL[deltaTone(value)]}`}>
      {signed(value, unit)}
    </span>
  );
}

const TH = "px-3 pb-2.5 font-dash-mono text-[10px] font-medium uppercase tracking-[0.06em] text-dash-faint whitespace-nowrap";

/**
 * Last N quarters as one compact table, newest first. Each change is against the
 * quarter before it (the row below). Replaces a grid of four large cards.
 */
export default function QuarterlyHistoryTable({ quarters }: Readonly<{ quarters: QuarterStats[] }>) {
  // Quarters arrive oldest first; compare each with its predecessor, then show newest first
  const rows = quarters
    .map((q, i) => {
      const prev = quarters[i - 1];
      return {
        q,
        pipelineDelta: prev ? pctChange(q.pipelineValue, prev.pipelineValue) : null,
        winRateDelta: prev ? Math.round((q.winRate - prev.winRate) * 10) / 10 : null,
        avgDealDelta: prev ? pctChange(q.avgDealSize, prev.avgDealSize) : null,
      };
    })
    .reverse();

  return (
    <div className="relative overflow-x-auto pt-3.5">
      <table className="w-full min-w-120 border-collapse">
        <thead>
          <tr className="border-b border-dash-border text-left">
            <th scope="col" className={`${TH} pl-5`}>Quarter</th>
            <th scope="col" className={`${TH} text-right`}>Pipeline</th>
            <th scope="col" className={`${TH} text-right`}>Quotes</th>
            <th scope="col" className={`${TH} text-right`}>Win rate</th>
            <th scope="col" className={`${TH} pr-5 text-right`}>Avg deal</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ q, pipelineDelta, winRateDelta, avgDealDelta }) => (
            <tr
              key={q.from}
              aria-current={q.isCurrent ? "true" : undefined}
              className={`border-b border-dash-border last:border-b-0 ${q.isCurrent ? "bg-dash-accent-bg" : "hover:bg-dash-raised"}`}
            >
              <th scope="row" className="py-2.75 pl-5 pr-3 text-left font-normal">
                <span className={`font-dash-mono text-xs font-semibold ${q.isCurrent ? "text-dash-accent" : "text-dash-text"}`}>
                  {q.quarter}
                </span>
                <span className="block whitespace-nowrap font-dash-mono text-[10px] text-dash-faint">
                  {monthSpan(q.from, q.to)}
                  {q.isCurrent && " · in progress"}
                </span>
              </th>
              <td className="px-3 py-2.75 text-right font-dash-mono text-xs tabular-nums text-dash-text whitespace-nowrap">
                {formatCurrencyCompact(q.pipelineValue)}
                <QoqPill value={pipelineDelta} unit="%" />
              </td>
              <td className="px-3 py-2.75 text-right font-dash-mono text-xs tabular-nums text-dash-muted">
                {q.totalQuotations.toLocaleString()}
              </td>
              <td className="px-3 py-2.75 text-right font-dash-mono text-xs tabular-nums text-dash-text whitespace-nowrap">
                {q.winRate}%
                <QoqPill value={winRateDelta} unit="pp" />
              </td>
              <td className="py-2.75 pl-3 pr-5 text-right font-dash-mono text-xs tabular-nums text-dash-text whitespace-nowrap">
                {formatCurrencyCompact(q.avgDealSize)}
                <QoqPill value={avgDealDelta} unit="%" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
