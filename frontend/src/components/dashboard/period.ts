// Period selector options, shared by the dashboard and the Win/Loss pipeline analysis.

export type Period = "month" | "30d" | "90d" | "all";

export const PERIOD_LABELS: Record<Period, string> = {
  month: "This month",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  all: "All time",
};

/** Suffix for trend pills, e.g. "vs prev 90d" */
export const PREV_LABELS: Record<Period, string> = {
  month: "vs prev month",
  "30d": "vs prev 30d",
  "90d": "vs prev 90d",
  all: "",
};

export function periodToRange(p: Period, now: Date = new Date()): { from?: string; to?: string } {
  if (p === "all") return {};
  if (p === "month") {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: from.toISOString(), to: now.toISOString() };
  }
  const days = p === "30d" ? 30 : 90;
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: now.toISOString() };
}
