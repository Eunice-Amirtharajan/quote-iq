import type { ReactNode } from "react";

interface PanelProps {
  title: string;
  meta?: string;
  /** Rendered next to the title, e.g. a count badge */
  badge?: ReactNode;
  loading: boolean;
  error?: unknown;
  /** True once the panel has data to show — current or from the previous period */
  hasData: boolean;
  /** Approximate content height, so the skeleton doesn't shift the layout */
  skeletonHeight?: number;
  tone?: "default" | "stale";
  className?: string;
  children: ReactNode;
}

/**
 * Card shell shared by every dashboard panel. Each panel owns its query, so one
 * slow or failing query never blanks the rest of the page. On refetch the
 * previous render stays visible at reduced opacity instead of flashing a skeleton.
 */
export default function Panel({
  title,
  meta,
  badge,
  loading,
  error,
  hasData,
  skeletonHeight = 160,
  tone = "default",
  className = "",
  children,
}: Readonly<PanelProps>) {
  const isStale = tone === "stale";

  let body: ReactNode;
  if (!hasData && error) {
    body = (
      <p className="px-5 py-8 text-sm text-dash-neg text-center">
        Couldn't load {title.toLowerCase()}
      </p>
    );
  } else if (!hasData && loading) {
    body = (
      <div className="p-5" aria-busy="true" aria-label={`Loading ${title.toLowerCase()}`}>
        <div className="animate-pulse rounded-lg bg-dash-raised" style={{ height: skeletonHeight }} />
      </div>
    );
  } else {
    body = (
      <div className={`transition-opacity ${loading ? "opacity-60" : "opacity-100"}`}>
        {children}
      </div>
    );
  }

  return (
    <section
      aria-label={title}
      // relative: absolutely positioned descendants (sr-only tables and labels) must be
      // contained and clipped here, or they widen the page on small screens
      className={`relative bg-white rounded-xl border overflow-hidden ${
        isStale ? "border-dash-stale-border" : "border-dash-border"
      } ${className}`}
    >
      <header
        className={`flex items-center justify-between gap-3 flex-wrap px-5 pt-4 pb-3.5 border-b ${
          isStale ? "border-dash-stale-border bg-dash-stale-bg" : "border-dash-border"
        }`}
      >
        <div className="flex items-center gap-2.5">
          <h3 className={`text-[13px] font-semibold ${isStale ? "text-dash-stale" : "text-dash-text"}`}>{title}</h3>
          {badge}
        </div>
        {meta && <p className="font-dash-mono text-[11px] text-dash-faint">{meta}</p>}
      </header>
      {body}
    </section>
  );
}
