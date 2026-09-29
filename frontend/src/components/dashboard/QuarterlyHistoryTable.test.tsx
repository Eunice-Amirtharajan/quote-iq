import { render, screen, within } from "@testing-library/react";
import QuarterlyHistoryTable from "./QuarterlyHistoryTable";
import type { QuarterStats } from "./analytics";

const quarter = (label: string, from: string, to: string, over: Partial<QuarterStats> = {}): QuarterStats => ({
  quarter: label,
  from,
  to,
  isCurrent: false,
  totalQuotations: 1000,
  totalApproved: 500,
  pipelineValue: 50_000_000,
  approvedRevenue: 20_000_000,
  winRate: 60,
  avgDealSize: 40_000,
  ...over,
});

// Oldest first, as the API returns them
const quarters = [
  quarter("Q2 2026", "2026-04-01T00:00:00.000Z", "2026-06-30T23:59:59.999Z"),
  quarter("Q3 2026", "2026-07-01T00:00:00.000Z", "2026-09-30T23:59:59.999Z", {
    isCurrent: true,
    totalQuotations: 1520,
    pipelineValue: 56_000_000,
    winRate: 57.5,
    avgDealSize: 39_200,
  }),
];

const rowFor = (quarterLabel: string) => screen.getByRole("rowheader", { name: new RegExp(quarterLabel) }).closest("tr")!;

describe("QuarterlyHistoryTable", () => {
  it("lists quarters newest first with their month span", () => {
    render(<QuarterlyHistoryTable quarters={quarters} />);

    const rowHeaders = screen.getAllByRole("rowheader").map((h) => h.textContent);
    expect(rowHeaders).toEqual(["Q3 2026Jul – Sep · in progress", "Q2 2026Apr – Jun"]);
  });

  it("marks the current quarter", () => {
    render(<QuarterlyHistoryTable quarters={quarters} />);
    expect(rowFor("Q3 2026")).toHaveAttribute("aria-current", "true");
    expect(rowFor("Q2 2026")).not.toHaveAttribute("aria-current");
  });

  it("shows pipeline, quotes, win rate and average deal for each quarter", () => {
    render(<QuarterlyHistoryTable quarters={quarters} />);
    const current = within(rowFor("Q3 2026"));

    expect(current.getByText("€56.0M")).toBeInTheDocument();
    expect(current.getByText("1,520")).toBeInTheDocument();
    expect(current.getByText("57.5%")).toBeInTheDocument();
    expect(current.getByText("€39.2K")).toBeInTheDocument();
  });

  it("compares each quarter with the one before it, coloured by direction", () => {
    render(<QuarterlyHistoryTable quarters={quarters} />);
    const current = within(rowFor("Q3 2026"));

    expect(current.getByText("+12%")).toHaveClass("text-dash-pos"); // pipeline 50M → 56M
    expect(current.getByText("−2.5pp")).toHaveClass("text-dash-neg"); // win rate 60 → 57.5
    expect(current.getByText("−2%")).toHaveClass("text-dash-neg"); // avg deal 40.0K → 39.2K
  });

  it("shows no change badges on the oldest quarter", () => {
    render(<QuarterlyHistoryTable quarters={quarters} />);
    expect(within(rowFor("Q2 2026")).queryByText(/^[+−]|^0(%|pp)$/)).not.toBeInTheDocument();
  });
});
