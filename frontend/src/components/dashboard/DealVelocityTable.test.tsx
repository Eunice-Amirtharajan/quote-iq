import { render, screen, within } from "@testing-library/react";
import DealVelocityTable from "./DealVelocityTable";
import type { DealVelocity } from "./analytics";

const row = (transition: string, avg: number | null, p90: number | null, n: number): DealVelocity => ({
  transition,
  avgDays: avg,
  p90Days: p90,
  sampleSize: n,
});

// The concept's own example numbers: 3.2 / 11.6 / 18.4 against a 14.8-day cycle
const rows = [
  row("DRAFT_TO_SENT", 3.2, 7.1, 3032),
  row("SENT_TO_APPROVED", 11.6, 22.4, 2083),
  row("SENT_TO_REJECTED", 18.4, 34.2, 599),
  row("FULL_CYCLE", 14.8, 28.6, 2682),
];

const rowFor = (label: string) => screen.getByText(label).closest("tr")!;

describe("DealVelocityTable", () => {
  it("lists every transition with average and p90 days", () => {
    render(<DealVelocityTable rows={rows} />);

    expect(within(rowFor("SENT → APPROVED")).getByText("11.6d")).toBeInTheDocument();
    expect(within(rowFor("SENT → APPROVED")).getByText("22.4d")).toBeInTheDocument();
    expect(screen.getByText("DRAFT → SENT")).toBeInTheDocument();
    expect(screen.getByText("Full cycle")).toBeInTheDocument();
  });

  it("gives each stage a pace badge relative to the full cycle", () => {
    render(<DealVelocityTable rows={rows} />);

    expect(within(rowFor("DRAFT → SENT")).getByText("Fast")).toBeInTheDocument();
    expect(within(rowFor("SENT → APPROVED")).getByText("Avg")).toBeInTheDocument();
    expect(within(rowFor("SENT → REJECTED")).getByText("Slow")).toBeInTheDocument();
    expect(within(rowFor("Full cycle")).getByText("Avg")).toBeInTheDocument();
  });

  it("keeps the sample size available on hover", () => {
    render(<DealVelocityTable rows={rows} />);
    expect(rowFor("DRAFT → SENT")).toHaveAttribute("title", "3,032 deals");
  });

  it("states how much slower rejections are than approvals", () => {
    render(<DealVelocityTable rows={rows} />);
    // (18.4 - 11.6) / 11.6 = 58.6%
    expect(screen.getByText(/Rejected deals take 58.6% longer than approvals/)).toBeInTheDocument();
  });

  it("shows dashes and no badge for transitions with no samples, and drops the signal", () => {
    render(<DealVelocityTable rows={[rows[0], row("SENT_TO_APPROVED", null, null, 0), rows[2], rows[3]]} />);

    const empty = rowFor("SENT → APPROVED");
    expect(within(empty).getAllByText("—")).toHaveLength(2);
    expect(within(empty).queryByText(/Fast|Avg|Slow/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Signal:/)).not.toBeInTheDocument();
  });

  it("shows an empty state when nothing moved in the period", () => {
    render(<DealVelocityTable rows={rows.map((r) => ({ ...r, avgDays: null, p90Days: null, sampleSize: 0 }))} />);
    expect(screen.getByText("No status changes in this period")).toBeInTheDocument();
  });
});
