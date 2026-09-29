import { MONO, truncate, type DealSizeCell, type RepDealSizeWinRates } from "./analytics";
import {
  DELTA_RANGE_PP,
  LEGEND_GRADIENT,
  MIN_SAMPLE,
  TEAM_ROW,
  bucketLabel,
  cellStyle,
  deltaPp,
  heatmapLayout,
} from "./heatmap";

interface WinRateHeatmapProps {
  data: RepDealSizeWinRates;
  onPageChange: (offset: number) => void;
}

function describeCell(repName: string, cell: DealSizeCell, team: DealSizeCell | undefined): string {
  if (cell.winRate === null) return `${repName}, ${bucketLabel(cell.bucket)}: no decided deals`;
  const delta = deltaPp(cell.winRate, team?.winRate ?? null);
  const vsTeam = delta === null ? "" : `, ${delta >= 0 ? "+" : ""}${delta} pp vs team`;
  return `${repName}, ${bucketLabel(cell.bucket)}: ${cell.winRate}% (${cell.approved} of ${cell.decided} won${vsTeam})`;
}

/**
 * Win rate per rep in each deal-size band, coloured against the team's rate for the
 * same band — so a rep who only loses big deals looks different from one who is
 * weaker across the board. Every cell prints its value; colour is never the only cue.
 */
export default function WinRateHeatmap({ data, onPageChange }: Readonly<WinRateHeatmapProps>) {
  const { buckets, teamAverage, reps, totalReps, offset, limit } = data;

  if (totalReps === 0) {
    return <p className="px-5 py-8 text-sm text-dash-faint text-center">No decided quotations in this period</p>;
  }

  const layout = heatmapLayout(
    buckets,
    reps.map((r) => r.repId),
  );
  const teamFor = (bucket: string) => teamAverage.find((t) => t.bucket === bucket);

  const renderCell = (key: string, name: string, cell: DealSizeCell, isTeam: boolean) => {
    const { x, width } = layout.column(cell.bucket);
    const { y, height } = layout.row(key);
    const team = teamFor(cell.bucket);
    // The team row is the baseline itself, so it is drawn neutral with a border
    const style = isTeam
      ? { fill: "#ffffff", ink: "#0f1117", lowSample: false }
      : cellStyle(cell.winRate, team?.winRate ?? null, cell.decided);
    const cx = x + width / 2;
    return (
      <g key={`${key}-${cell.bucket}`}>
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          rx={4}
          fill={style.fill}
          stroke={isTeam ? "#e4e7ef" : "none"}
          data-low-sample={style.lowSample || undefined}
        >
          <title>{describeCell(name, cell, isTeam ? undefined : team)}</title>
        </rect>
        <text
          x={cx}
          y={y + height / 2 - (style.lowSample ? 0 : 2)}
          dy="0.35em"
          textAnchor="middle"
          fontFamily={MONO}
          fontSize={13}
          fontWeight={isTeam ? 600 : 500}
          fill={style.ink}
        >
          {cell.winRate === null ? "—" : `${cell.winRate}%`}
        </text>
        <text
          x={cx}
          y={y + height / 2 + 12}
          dy="0.35em"
          textAnchor="middle"
          fontFamily={MONO}
          fontSize={9}
          fill={style.ink}
          opacity={0.75}
        >
          {style.lowSample && cell.decided > 0 ? `n<${MIN_SAMPLE}` : `n=${cell.decided.toLocaleString()}`}
        </text>
      </g>
    );
  };

  const nameText = (key: string, name: string, bold: boolean) => {
    const { y, height } = layout.row(key);
    const shown = truncate(name, 22);
    return (
      <text key={`name-${key}`} x={0} y={y + height / 2} dy="0.35em" fontSize={12.5} fontWeight={bold ? 600 : 400} fill="#0f1117">
        {shown !== name && <title>{name}</title>}
        {shown}
      </text>
    );
  };

  const pageEnd = offset + reps.length;
  const hasPages = totalReps > limit;

  return (
    <div className="px-5 pt-4 pb-4">
      {/* Scrolls sideways on phones rather than shrinking the text below legibility */}
      <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        // Capped so the grid keeps its proportions instead of scaling type up on wide screens
        className="w-full min-w-140 max-w-[880px] h-auto"
        role="img"
        aria-label={`Win rate by rep and deal size, ${reps.length} reps shown, compared with the team average`}
      >
        {buckets.map((b) => {
          const { x, width } = layout.column(b);
          return (
            <text key={`h-${b}`} x={x + width / 2} y={layout.headerHeight - 12} textAnchor="middle" fontFamily={MONO} fontSize={10.5} fill="#9ca3af">
              {bucketLabel(b).toUpperCase()}
            </text>
          );
        })}
        {reps.map((rep) => (
          <g key={rep.repId}>
            {nameText(rep.repId, rep.repName, false)}
            {rep.cells.map((cell) => renderCell(rep.repId, rep.repName, cell, false))}
          </g>
        ))}
        {nameText(TEAM_ROW, "Team average", true)}
        {teamAverage.map((cell) => renderCell(TEAM_ROW, "Team average", cell, true))}
      </svg>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 font-dash-mono text-[10px] text-dash-faint">
          <span>−{DELTA_RANGE_PP} pp</span>
          <span aria-hidden="true" className="h-2 w-32 rounded-sm" style={{ background: LEGEND_GRADIENT }} />
          <span>+{DELTA_RANGE_PP} pp vs team avg for that deal size</span>
          <span className="ml-2 inline-flex items-center gap-1">
            <span aria-hidden="true" className="h-2 w-3 rounded-sm border border-dash-border bg-dash-bg" />
            fewer than {MIN_SAMPLE} deals
          </span>
        </div>

        {hasPages && (
          <div className="flex items-center gap-2 text-xs text-dash-muted">
            <span>
              {offset + 1}–{pageEnd} of {totalReps} reps
            </span>
            <button
              type="button"
              onClick={() => onPageChange(Math.max(offset - limit, 0))}
              disabled={offset === 0}
              className="rounded-md border border-dash-border px-2.5 py-1 font-medium hover:bg-dash-raised disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => onPageChange(offset + limit)}
              disabled={pageEnd >= totalReps}
              className="rounded-md border border-dash-border px-2.5 py-1 font-medium hover:bg-dash-raised disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Every value as a table, for screen readers */}
      <table className="sr-only">
        <caption>Win rate by rep and deal size</caption>
        <thead>
          <tr>
            <th scope="col">Rep</th>
            {buckets.map((b) => (
              <th key={b} scope="col">
                {bucketLabel(b)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...reps.map((r) => ({ name: r.repName, cells: r.cells })), { name: "Team average", cells: teamAverage }].map((r) => (
            <tr key={r.name}>
              <th scope="row">{r.name}</th>
              {r.cells.map((c) => (
                <td key={c.bucket}>{c.winRate === null ? "no decided deals" : `${c.winRate}% of ${c.decided}`}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
