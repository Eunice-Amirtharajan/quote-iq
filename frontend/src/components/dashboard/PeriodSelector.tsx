import { PERIOD_LABELS, type Period } from "./period";

interface PeriodSelectorProps {
  value: Period;
  onChange: (period: Period) => void;
  /** Accessible name for the button group */
  label?: string;
}

export default function PeriodSelector({ value, onChange, label = "Period" }: Readonly<PeriodSelectorProps>) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-2">
      {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
        <button
          key={p}
          type="button"
          aria-pressed={value === p}
          onClick={() => onChange(p)}
          className={`rounded-md border px-3 py-1.5 font-dash-mono text-xs transition-colors ${
            value === p
              ? "border-dash-text bg-dash-text text-white"
              : "border-dash-border bg-white text-dash-muted hover:border-dash-muted hover:text-dash-text"
          }`}
        >
          {PERIOD_LABELS[p]}
        </button>
      ))}
    </div>
  );
}
