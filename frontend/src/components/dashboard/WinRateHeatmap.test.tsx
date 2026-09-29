import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import WinRateHeatmap from "./WinRateHeatmap";
import type { DealSizeCell, RepDealSizeWinRates } from "./analytics";

const cell = (bucket: string, approved: number, rejected: number): DealSizeCell => {
  const decided = approved + rejected;
  return { bucket, approved, rejected, decided, winRate: decided ? Math.round((approved / decided) * 1000) / 10 : null };
};

const data = (over: Partial<RepDealSizeWinRates> = {}): RepDealSizeWinRates => ({
  buckets: ["<5k", "5k–20k", ">20k"],
  totalReps: 2,
  offset: 0,
  limit: 10,
  teamAverage: [cell("<5k", 56, 44), cell("5k–20k", 64, 36), cell(">20k", 60, 40)],
  reps: [
    { repId: "anna", repName: "Anna Schmidt", decided: 110, winRate: 78, cells: [cell("<5k", 20, 7), cell("5k–20k", 40, 11), cell(">20k", 25, 7)] },
    { repId: "tom", repName: "Tom Muller", decided: 64, winRate: 44, cells: [cell("<5k", 2, 3), cell("5k–20k", 12, 13), cell(">20k", 14, 20)] },
  ],
  ...over,
});

const svg = (container: HTMLElement) => within(container.querySelector<HTMLElement>("svg")!);

describe("WinRateHeatmap", () => {
  it("draws a column per deal-size band and a row per rep plus the team baseline", () => {
    const { container } = render(<WinRateHeatmap data={data()} onPageChange={vi.fn()} />);
    const s = svg(container);

    for (const header of ["< €5K", "€5K – €20K", "> €20K"]) expect(s.getByText(header)).toBeInTheDocument();
    expect(s.getByText("Anna Schmidt")).toBeInTheDocument();
    expect(s.getByText("Tom Muller")).toBeInTheDocument();
    expect(s.getByText("Team average")).toBeInTheDocument();
    expect(container.querySelectorAll("svg rect")).toHaveLength(9); // (2 reps + team) × 3 bands
  });

  it("prints every cell's win rate and sample size", () => {
    const { container } = render(<WinRateHeatmap data={data()} onPageChange={vi.fn()} />);
    const s = svg(container);

    expect(s.getByText("74.1%")).toBeInTheDocument(); // Anna <5k: 20 of 27
    expect(s.getByText("n=27")).toBeInTheDocument();
    expect(s.getByText("41.2%")).toBeInTheDocument(); // Tom >20k: 14 of 34
  });

  it("marks low-sample cells instead of colouring them", () => {
    const { container } = render(<WinRateHeatmap data={data()} onPageChange={vi.fn()} />);

    // Tom <5k has 5 decided deals
    expect(svg(container).getByText("n<10")).toBeInTheDocument();
    expect(container.querySelectorAll("rect[data-low-sample]")).toHaveLength(1);
  });

  it("explains each cell against the team in its tooltip", () => {
    const { container } = render(<WinRateHeatmap data={data()} onPageChange={vi.fn()} />);
    const titles = [...container.querySelectorAll("rect > title")].map((t) => t.textContent);

    expect(titles).toContain("Tom Muller, > €20k: 41.2% (14 of 34 won, -18.8 pp vs team)");
    expect(titles).toContain("Anna Schmidt, €5k – €20k: 78.4% (40 of 51 won, +14.4 pp vs team)");
  });

  it("offers every value as an accessible table", () => {
    render(<WinRateHeatmap data={data()} onPageChange={vi.fn()} />);
    const table = screen.getByRole("table", { name: "Win rate by rep and deal size" });

    expect(within(table).getAllByRole("row")).toHaveLength(4); // header + 2 reps + team
    expect(within(table).getByRole("rowheader", { name: "Team average" })).toBeInTheDocument();
  });

  it("shows a legend explaining the colour scale", () => {
    render(<WinRateHeatmap data={data()} onPageChange={vi.fn()} />);
    expect(screen.getByText("+20 pp vs team avg for that deal size")).toBeInTheDocument();
    expect(screen.getByText("fewer than 10 deals")).toBeInTheDocument();
  });

  it("pages through reps when there are more than fit", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(<WinRateHeatmap data={data({ totalReps: 23, offset: 10 })} onPageChange={onPageChange} />);

    expect(screen.getByText("11–12 of 23 reps")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(onPageChange).toHaveBeenCalledWith(20);
    await user.click(screen.getByRole("button", { name: "Previous" }));
    expect(onPageChange).toHaveBeenCalledWith(0);
  });

  it("hides paging when every rep fits on one page", () => {
    render(<WinRateHeatmap data={data()} onPageChange={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
  });

  it("shows an empty state when nothing was decided", () => {
    render(<WinRateHeatmap data={data({ totalReps: 0, reps: [] })} onPageChange={vi.fn()} />);
    expect(screen.getByText("No decided quotations in this period")).toBeInTheDocument();
  });
});
