import type { ReactNode } from "react";

export type PillTone = "up" | "down" | "flat" | "stale";

const PILL: Record<PillTone, string> = {
  up: "text-dash-pos bg-dash-pos-bg",
  down: "text-dash-neg bg-dash-neg-bg",
  flat: "text-dash-faint bg-dash-raised",
  stale: "text-dash-stale bg-dash-stale-bg",
};

export function DeltaPill({ tone, children }: Readonly<{ tone: PillTone; children: ReactNode }>) {
  return (
    <span
      className={`mt-0.5 inline-flex w-fit items-center gap-1 rounded px-1.5 py-0.5 font-dash-mono text-[11px] font-medium ${PILL[tone]}`}
    >
      {children}
    </span>
  );
}

interface KpiTileProps {
  label: string;
  value: string;
  sub?: string;
  /** Colour of the 3px bar across the top of the tile */
  accent: string;
  loading: boolean;
  pill?: ReactNode;
}

export default function KpiTile({ label, value, sub, accent, loading, pill }: Readonly<KpiTileProps>) {
  return (
    <div className="relative flex flex-col gap-1.5 overflow-hidden rounded-xl border border-dash-border bg-white px-5 pt-5 pb-[18px]">
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-[3px]" style={{ backgroundColor: accent }} />
      <p className="font-dash-mono text-[11px] font-medium uppercase tracking-[0.06em] text-dash-faint">{label}</p>
      {loading ? (
        <div className="h-7 w-28 animate-pulse rounded bg-dash-raised" aria-label={`Loading ${label.toLowerCase()}`} />
      ) : (
        <p className="font-dash-mono text-[28px] font-semibold leading-none tracking-[-0.03em] text-dash-text">
          {value}
        </p>
      )}
      {sub && <p className="mt-px font-dash-mono text-[11px] text-dash-faint">{sub}</p>}
      <div className="min-h-5">{pill}</div>
    </div>
  );
}
