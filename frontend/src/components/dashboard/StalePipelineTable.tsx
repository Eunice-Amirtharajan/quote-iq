import { useState } from "react";
import { Link } from "react-router-dom";
import {
  CHART,
  formatCurrency,
  formatShortDate,
  staleTier,
  type StalePipeline,
  type StaleTier,
} from "./analytics";

const COLLAPSED_ROWS = 6;

// Urgency colours from the concept; the tier word is kept for screen readers
const TIER: Record<StaleTier, { label: string; color: string }> = {
  critical: { label: "Critical", color: CHART.critical },
  warning: { label: "Warning", color: CHART.warning },
  watch: { label: "Watch", color: CHART.stale },
};

/** "Anna Schmidt" → "Anna S."; a numeric last part is kept whole ("Load Test Rep 17" → "Load 17") */
function shortName(name: string): string {
  const [first, ...rest] = name.trim().split(/\s+/);
  const last = rest.at(-1);
  if (!last) return first;
  return /^\d+$/.test(last) ? `${first} ${last}` : `${first} ${last[0]}.`;
}

const TH = "px-3 pb-2.5 font-dash-mono text-[10px] font-medium uppercase tracking-[0.06em] text-dash-faint whitespace-nowrap";

export default function StalePipelineTable({ pipeline }: Readonly<{ pipeline: StalePipeline }>) {
  const [expanded, setExpanded] = useState(false);
  const { items, totalCount, totalValue, thresholdDays } = pipeline;

  if (totalCount === 0) {
    return (
      <p className="px-5 py-8 text-sm text-dash-faint text-center">
        No SENT quotations have been waiting more than {thresholdDays} days
      </p>
    );
  }

  const visible = expanded ? items : items.slice(0, COLLAPSED_ROWS);
  const remaining = totalCount - visible.length;
  // Every stale quote not shown is between the threshold and the next one in the list
  const nextDays = items[visible.length]?.daysStale;

  return (
    <div>
      {/* relative: the sr-only tier labels are absolutely positioned and must stay inside this scroll box */}
      <div className="relative overflow-x-auto pt-3.5">
        <table className="w-full min-w-170 border-collapse">
          <thead>
            <tr className="border-b border-dash-border text-left">
              <th scope="col" className={`${TH} pl-5`}>Quote</th>
              <th scope="col" className={TH}>Client</th>
              <th scope="col" className={TH}>Rep</th>
              <th scope="col" className={`${TH} text-right`}>Value</th>
              <th scope="col" className={TH}>Sent</th>
              <th scope="col" className={`${TH} pr-5`}>Days stale</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((q) => {
              const tier = TIER[staleTier(q.daysStale)];
              return (
                <tr key={q.id} className="border-b border-dash-border last:border-b-0 hover:bg-dash-raised">
                  <td className="py-2.75 pl-5 pr-3 align-middle">
                    <Link
                      to={`/quotations/${q.id}`}
                      className="font-dash-mono text-xs text-dash-text hover:underline"
                    >
                      {q.quotationNumber}
                    </Link>
                    <p className="mt-px max-w-70 truncate text-[11px] text-dash-muted">{q.title}</p>
                  </td>
                  <td className="px-3 py-2.75 text-[12.5px] text-dash-text">{q.clientName}</td>
                  <td className="px-3 py-2.75">
                    <span
                      className="inline-block rounded border border-dash-border bg-dash-raised px-1.5 py-px font-dash-mono text-[10px] text-dash-muted"
                      title={q.repName}
                    >
                      {shortName(q.repName)}
                    </span>
                  </td>
                  <td className="px-3 py-2.75 text-right font-dash-mono text-xs tabular-nums text-dash-text">
                    {formatCurrency(q.total)}
                  </td>
                  <td className="px-3 py-2.75 font-dash-mono text-xs tabular-nums text-dash-muted">
                    {formatShortDate(q.sentAt)}
                  </td>
                  <td className="py-2.75 pl-3 pr-5">
                    <span className="inline-flex items-center gap-1.5">
                      <span aria-hidden="true" className="h-2 w-2 rounded-sm" style={{ backgroundColor: tier.color }} />
                      <span className="font-dash-mono text-xs font-medium tabular-nums" style={{ color: tier.color }}>
                        {q.daysStale}d
                      </span>
                      <span className="sr-only">{tier.label}</span>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-dash-stale-border bg-dash-stale-bg px-5 py-2.5">
        <span className="text-[11.5px] text-dash-stale">
          Showing {visible.length} most critical
          {remaining > 0 && (
            <>
              {" "}· {remaining.toLocaleString()} more
              {nextDays === undefined ? "" : ` between ${thresholdDays}–${nextDays} days`}
            </>
          )}{" "}
          · sorted by days stale desc
          {items.length > COLLAPSED_ROWS && (
            <>
              {" · "}
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="font-medium underline-offset-2 hover:underline"
              >
                {expanded ? "Show fewer" : `Show ${items.length}`}
              </button>
            </>
          )}
        </span>
        <span className="font-dash-mono text-xs font-medium text-dash-stale">
          {formatCurrency(totalValue)} total at risk
        </span>
      </footer>
    </div>
  );
}
