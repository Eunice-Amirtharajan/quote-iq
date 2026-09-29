// Layout and colour maths for the rep × deal-size win-rate heatmap. D3 is used purely
// as a math library (band scales for the grid, a diverging scale for colour); React
// renders the SVG. Kept free of React so it can be unit tested directly.
import { scaleBand, scaleDiverging } from "d3-scale";

/** Cells with fewer decided deals than this are greyed out — too little evidence */
export const MIN_SAMPLE = 10;

/** Colour saturates at ±this many percentage points from the team average */
export const DELTA_RANGE_PP = 20;

// Diverging pair from the reference palette: red below the team, blue above,
// neutral grey at the midpoint so "same as the team" reads as "nothing to see".
export const DIVERGING = {
  below: "#e34948",
  neutral: "#f0efec",
  above: "#2a78d6",
} as const;

export const LOW_SAMPLE_FILL = "#f8f9fc";

const hex = (c: string) => [1, 3, 5].map((i) => Number.parseInt(c.slice(i, i + 2), 16));

function mix(from: string, to: string, t: number): string {
  const [a, b] = [hex(from), hex(to)];
  const channel = (i: number) => Math.round(a[i] + (b[i] - a[i]) * t);
  return `rgb(${channel(0)}, ${channel(1)}, ${channel(2)})`;
}

/** Red → grey → blue; t runs 0..1 with the team average at 0.5 */
function divergingInterpolator(t: number): string {
  return t < 0.5 ? mix(DIVERGING.below, DIVERGING.neutral, t * 2) : mix(DIVERGING.neutral, DIVERGING.above, (t - 0.5) * 2);
}

const deltaColor = scaleDiverging<string>(divergingInterpolator)
  .domain([-DELTA_RANGE_PP, 0, DELTA_RANGE_PP])
  .clamp(true);

/** Percentage points between a rep's win rate and the team's, for the same deal size */
export function deltaPp(winRate: number | null, teamRate: number | null): number | null {
  if (winRate === null || teamRate === null) return null;
  return Math.round((winRate - teamRate) * 10) / 10;
}

export interface CellStyle {
  fill: string;
  /** Ink that stays readable on the fill */
  ink: string;
  lowSample: boolean;
}

export function cellStyle(winRate: number | null, teamRate: number | null, decided: number): CellStyle {
  const delta = deltaPp(winRate, teamRate);
  if (delta === null || decided < MIN_SAMPLE) {
    return { fill: LOW_SAMPLE_FILL, ink: "#9ca3af", lowSample: true };
  }
  // Strongly coloured cells need white text; pale ones keep dark ink
  const strong = Math.abs(delta) >= DELTA_RANGE_PP * 0.6;
  return { fill: deltaColor(delta), ink: strong ? "#ffffff" : "#0f1117", lowSample: false };
}

/** CSS gradient matching the scale, for the legend */
export const LEGEND_GRADIENT = `linear-gradient(to right, ${DIVERGING.below}, ${DIVERGING.neutral}, ${DIVERGING.above})`;

export interface HeatmapLayout {
  width: number;
  height: number;
  nameWidth: number;
  headerHeight: number;
  /** x position and width of each deal-size column */
  column: (bucket: string) => { x: number; width: number };
  /** y position and height of each row (rep ids, plus the team row key) */
  row: (key: string) => { y: number; height: number };
}

export const TEAM_ROW = "__team__";

/**
 * Band scales for the grid: one column per deal-size band, one row per rep, and
 * the team baseline as a final row separated by a small gap.
 */
export function heatmapLayout(
  buckets: string[],
  repIds: string[],
  { width = 720, nameWidth = 176, headerHeight = 30, rowHeight = 38, teamGap = 10 } = {},
): HeatmapLayout {
  const x = scaleBand<string>().domain(buckets).range([nameWidth, width]).paddingInner(0.04);
  const repsBottom = headerHeight + repIds.length * rowHeight;
  const y = scaleBand<string>().domain(repIds).range([headerHeight, repsBottom]).paddingInner(0.08);
  const teamTop = repsBottom + teamGap;

  return {
    width,
    height: teamTop + rowHeight,
    nameWidth,
    headerHeight,
    column: (bucket) => ({ x: x(bucket) ?? nameWidth, width: x.bandwidth() }),
    row: (key) =>
      key === TEAM_ROW
        ? { y: teamTop, height: y.bandwidth() || rowHeight * 0.92 }
        : { y: y(key) ?? headerHeight, height: y.bandwidth() },
  };
}

/** "<5k" → "< €5k" etc., for column headers */
export function bucketLabel(bucket: string): string {
  const labels: Record<string, string> = { "<5k": "< €5k", "5k–20k": "€5k – €20k", ">20k": "> €20k" };
  return labels[bucket] ?? bucket;
}
