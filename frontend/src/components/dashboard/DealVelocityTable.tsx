import { dealPace, pctChange, type DealVelocity, type Pace } from "./analytics";

const TRANSITION_LABELS: Record<string, string> = {
  DRAFT_TO_SENT: "DRAFT → SENT",
  SENT_TO_APPROVED: "SENT → APPROVED",
  SENT_TO_REJECTED: "SENT → REJECTED",
  FULL_CYCLE: "Full cycle",
};

const PACE: Record<Pace, { label: string; className: string }> = {
  fast: { label: "Fast", className: "bg-dash-pos-bg text-dash-pos" },
  avg: { label: "Avg", className: "bg-dash-warn-bg text-dash-warn" },
  slow: { label: "Slow", className: "bg-dash-neg-bg text-dash-neg" },
};

const days = (d: number | null) => (d === null ? "—" : `${d}d`);

const TH = "px-3 pb-2.5 font-dash-mono text-[10px] font-medium uppercase tracking-[0.06em] text-dash-faint";

export default function DealVelocityTable({ rows }: Readonly<{ rows: DealVelocity[] }>) {
  if (rows.every((r) => r.sampleSize === 0)) {
    return <p className="px-5 py-8 text-sm text-dash-faint text-center">No status changes in this period</p>;
  }

  const byKey = new Map(rows.map((r) => [r.transition, r]));
  const fullCycleAvg = byKey.get("FULL_CYCLE")?.avgDays ?? null;
  const approvedAvg = byKey.get("SENT_TO_APPROVED")?.avgDays ?? null;
  const rejectedAvg = byKey.get("SENT_TO_REJECTED")?.avgDays ?? null;
  const slowerPct =
    approvedAvg !== null && rejectedAvg !== null ? pctChange(rejectedAvg, approvedAvg) : null;

  return (
    <div>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-dash-border text-left">
            <th scope="col" className={`${TH} pl-5 pt-3.5`}>Transition</th>
            <th scope="col" className={`${TH} pt-3.5`}>Avg</th>
            <th scope="col" className={`${TH} pt-3.5`}>p90</th>
            <th scope="col" className={`${TH} pt-3.5 pr-5 text-right`}>Pace</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const isTotal = r.transition === "FULL_CYCLE";
            const pace = dealPace(r.avgDays, fullCycleAvg);
            return (
              <tr
                key={r.transition}
                className="border-b border-dash-border last:border-b-0 hover:bg-dash-raised"
                title={`${r.sampleSize.toLocaleString()} deals`}
              >
                <td className={`py-2.75 pl-5 pr-3 text-[12.5px] text-dash-text ${isTotal ? "font-medium" : ""}`}>
                  {TRANSITION_LABELS[r.transition] ?? r.transition}
                </td>
                <td className={`px-3 py-2.75 font-dash-mono text-xs tabular-nums text-dash-text ${isTotal ? "font-medium" : ""}`}>
                  {days(r.avgDays)}
                </td>
                <td className="px-3 py-2.75 font-dash-mono text-xs tabular-nums text-dash-muted">{days(r.p90Days)}</td>
                <td className="py-2.75 pl-3 pr-5 text-right">
                  {pace && (
                    <span
                      className={`inline-block rounded px-1.75 py-0.5 font-dash-mono text-[10px] font-medium tracking-[0.03em] ${PACE[pace].className}`}
                    >
                      {PACE[pace].label}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {slowerPct !== null && slowerPct > 0 && (
        <p className="border-t border-dash-border px-5 py-3 text-[11.5px] leading-normal text-dash-muted">
          <strong className="font-semibold text-dash-text">Signal:</strong> Rejected deals take {slowerPct}% longer
          than approvals ({rejectedAvg}d vs {approvedAvg}d on average).
        </p>
      )}
    </div>
  );
}
