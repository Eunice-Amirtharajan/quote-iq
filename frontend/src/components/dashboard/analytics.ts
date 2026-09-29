// Shared types, chart colours and pure helpers for the Pipeline Intelligence dashboard.

export interface TrendIndicator {
  delta: number;
  pct: number;
  direction: "up" | "down" | "flat";
}

export interface DashboardStats {
  totalQuotations: number;
  totalSent: number;
  totalApproved: number;
  totalRejected: number;
  conversionRate: number;
  totalPipelineValue: number;
  totalApprovedValue: number;
  avgDealSize: number;
  medianDealSize: number | null;
  p90DealSize: number | null;
  totalQuotationsTrend?: TrendIndicator | null;
  conversionRateTrend?: TrendIndicator | null;
  totalPipelineValueTrend?: TrendIndicator | null;
  totalApprovedValueTrend?: TrendIndicator | null;
  avgDealSizeTrend?: TrendIndicator | null;
}

export interface RepPerformance {
  repId: string | null;
  repName: string;
  isOthers: boolean;
  totalSent: number;
  totalApproved: number;
  approvedRevenue: number;
  winRate: number;
}

export interface ApprovalRateMonth {
  month: string;
  sent: number;
  approved: number;
  rejected: number;
  rate: number | null;
}

export interface StaleQuotation {
  id: string;
  quotationNumber: string;
  title: string;
  clientId: string;
  clientName: string;
  repName: string;
  total: number;
  sentAt: string;
  daysStale: number;
}

export interface StalePipeline {
  thresholdDays: number;
  totalCount: number;
  totalValue: number;
  items: StaleQuotation[];
}

export interface ClientConcentration {
  clientId: string;
  clientName: string;
  approvedRevenue: number;
  shareOfTotal: number;
  quoteCount: number;
}

export interface DealVelocity {
  transition: string;
  avgDays: number | null;
  p90Days: number | null;
  sampleSize: number;
}

export interface QuarterStats {
  quarter: string;
  from: string;
  to: string;
  isCurrent: boolean;
  totalQuotations: number;
  totalApproved: number;
  pipelineValue: number;
  approvedRevenue: number;
  winRate: number;
  avgDealSize: number;
}

export interface DealSizeCell {
  bucket: string;
  approved: number;
  rejected: number;
  decided: number;
  winRate: number | null;
}

export interface RepDealSizeRow {
  repId: string;
  repName: string;
  decided: number;
  winRate: number | null;
  cells: DealSizeCell[];
}

export interface RepDealSizeWinRates {
  buckets: string[];
  totalReps: number;
  offset: number;
  limit: number;
  teamAverage: DealSizeCell[];
  reps: RepDealSizeRow[];
}

// Colours from the Pipeline Intelligence UI concept. The funnel keeps its ordinal
// blue ramp (validated light → dark); status colours always ship with a label.
export const CHART = {
  series: "#3b82f6",
  grid: "#e4e7ef",
  axis: "#e4e7ef",
  track: "#f1f3f8",
  inkPrimary: "#0f1117",
  inkSecondary: "#6b7280",
  inkMuted: "#9ca3af",
  funnel: ["#86b6ef", "#2a78d6", "#184f95"],
  critical: "#ef4444",
  warning: "#f59e0b",
  stale: "#ea580c",
  pos: "#10b981",
} as const;

/** Rank colours for the rep bars, as in the concept */
export const RANK_COLORS = ["#3b82f6", "#6366f1", "#8b5cf6", "#a78bfa", "#c4b5fd", "#ddd6fe"] as const;

/** A single client at or above this share of approved revenue is a concentration risk */
export const CONCENTRATION_RISK_SHARE = 34;

export const MONO = "'DM Mono', ui-monospace, monospace";

// ── Formatting ─────────────────────────────────────────────────────────────

export function formatCurrency(n: number): string {
  return `€${Math.round(n).toLocaleString()}`;
}

/** €84.2M / €18.5K / €950 — for chart labels and headline tiles */
export function formatCurrencyCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `€${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `€${(n / 1_000).toFixed(1)}K`;
  return `€${Math.round(n)}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-01" → "Jan" (or "Jan 2026" with the year) */
export function formatMonth(isoMonth: string, withYear = false): string {
  const [year, month] = isoMonth.split("-");
  const label = MONTHS[Number(month) - 1];
  return withYear ? `${label} ${year}` : label;
}

/** Short date for table cells: "28 Aug" */
export function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getUTCDate()).padStart(2, "0")} ${MONTHS[d.getUTCMonth()]}`;
}

export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

// ── Derived values ─────────────────────────────────────────────────────────

/** Percentage change, 1dp — null when there is no base to compare against */
export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

export type StaleTier = "critical" | "warning" | "watch";

/** ≥28d critical, 21–27d warning, otherwise watch */
export function staleTier(daysStale: number): StaleTier {
  if (daysStale >= 28) return "critical";
  if (daysStale >= 21) return "warning";
  return "watch";
}

/**
 * Y-axis domain for a percentage series: padded around the data and snapped to
 * 5pp so a flat period doesn't look volatile, clamped to 0–100.
 */
export function rateDomain(rates: (number | null)[]): [number, number] {
  const values = rates.filter((r): r is number => r !== null);
  if (values.length === 0) return [0, 100];
  const lo = Math.max(0, Math.floor((Math.min(...values) - 5) / 5) * 5);
  const hi = Math.min(100, Math.ceil((Math.max(...values) + 5) / 5) * 5);
  return [lo, hi];
}

export interface TrendExtremes {
  peak?: ApprovalRateMonth;
  trough?: ApprovalRateMonth;
  /** Change from the previous month in percentage points, when both have a rate */
  momPp: number | null;
}

export function trendExtremes(months: ApprovalRateMonth[]): TrendExtremes {
  const decided = months.filter((m) => m.rate !== null);
  const peak = decided.reduce<ApprovalRateMonth | undefined>(
    (best, m) => (!best || m.rate! > best.rate! ? m : best),
    undefined,
  );
  const trough = decided.reduce<ApprovalRateMonth | undefined>(
    (worst, m) => (!worst || m.rate! < worst.rate! ? m : worst),
    undefined,
  );
  const [prev, last] = months.slice(-2);
  const momPp =
    prev?.rate != null && last?.rate != null
      ? Math.round((last.rate - prev.rate) * 10) / 10
      : null;
  return { peak, trough, momPp };
}

export type DeltaTone = "up" | "down" | "neutral";

export function deltaTone(delta: number | null): DeltaTone {
  if (delta === null || delta === 0) return "neutral";
  return delta > 0 ? "up" : "down";
}

/** Text colour per direction — Tailwind classes, paired with an arrow so tone is never colour-only */
export const DELTA_TEXT: Record<DeltaTone, string> = {
  up: "text-dash-pos",
  down: "text-dash-neg",
  neutral: "text-dash-text",
};

/** Pill background + text per direction, for the concept's small QoQ badges */
export const DELTA_PILL: Record<DeltaTone, string> = {
  up: "text-dash-pos bg-dash-pos-bg",
  down: "text-dash-neg bg-dash-neg-bg",
  neutral: "text-dash-faint bg-dash-raised",
};

const ARROW: Record<DeltaTone, string> = { up: "↑ +", down: "↓ ", neutral: "" };

/** Percentage-point change: "↑ +2.1 pp", "↓ -3 pp", "0 pp", or "—" */
export function formatPpChange(pp: number | null): string {
  return pp === null ? "—" : `${ARROW[deltaTone(pp)]}${pp} pp`;
}

/** Percentage change: "↑ +12%", "↓ -2.2%", "0%", or "—" */
export function formatPctChange(pct: number | null): string {
  return pct === null ? "—" : `${ARROW[deltaTone(pct)]}${pct}%`;
}

export type Pace = "fast" | "avg" | "slow";

/**
 * Pace badge for a stage, relative to the full cycle: under half the cycle is fast,
 * up to 1.1× is average, longer is slow. Matches the concept's examples
 * (3.2d / 11.6d / 18.4d against a 14.8d cycle → fast / avg / slow).
 */
export function dealPace(avgDays: number | null, fullCycleAvgDays: number | null): Pace | null {
  if (avgDays === null || fullCycleAvgDays === null || fullCycleAvgDays <= 0) return null;
  const ratio = avgDays / fullCycleAvgDays;
  if (ratio < 0.5) return "fast";
  if (ratio <= 1.1) return "avg";
  return "slow";
}

/** Share of `part` in `whole` as "59.7%", or "—" when there is no base */
export function shareLabel(part: number, whole: number): string {
  return whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : "—";
}

/**
 * The stage conversion that used to be drawn as a funnel, as one line of text.
 * "Sent" is cumulative: totalSent only counts quotes *still* in SENT.
 */
export function stageConversion(s: Pick<DashboardStats, "totalQuotations" | "totalSent" | "totalApproved" | "totalRejected">) {
  const reached = s.totalSent + s.totalApproved + s.totalRejected;
  return {
    sentOfCreated: shareLabel(reached, s.totalQuotations),
    approvedOfSent: shareLabel(s.totalApproved, reached),
    rejectedOfSent: shareLabel(s.totalRejected, reached),
    openOfSent: shareLabel(s.totalSent, reached),
  };
}
