import { render, screen, within } from "@testing-library/react";
import { vi } from "vitest";
import RepPerformanceChart from "./RepPerformanceChart";
import { RANK_COLORS, type RepPerformance } from "./analytics";

vi.mock("recharts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("recharts")>()),
  // Imported inside the factory: vi.mock is hoisted above top-level imports
  ResponsiveContainer: (await import("../../test/recharts-mock")).FixedSizeContainer,
}));

const rep = (name: string, revenue: number, winRate: number, approved = 300, isOthers = false): RepPerformance => ({
  repId: isOthers ? null : `id-${name}`,
  repName: name,
  isOthers,
  totalSent: 500,
  totalApproved: approved,
  approvedRevenue: revenue,
  winRate,
});

const svgOf = (container: HTMLElement) => within(container.querySelector<HTMLElement>("svg")!);

describe("RepPerformanceChart", () => {
  it("shows each rep's name, revenue and 'win rate · deals' in the stat column", () => {
    const { container } = render(
      <RepPerformanceChart reps={[rep("Anna Schmidt", 14_200_000, 67, 312), rep("Tom Weber", 11_600_000, 59, 298)]} />,
    );
    const svg = svgOf(container);

    expect(svg.getByText("Anna Schmidt", { ignore: "title" })).toBeInTheDocument();
    expect(svg.getByText("€14.2M")).toBeInTheDocument();
    expect(svg.getByText("67% · 312 deals")).toBeInTheDocument();
    expect(svg.getByText("€11.6M")).toBeInTheDocument();
    expect(svg.getByText("59% · 298 deals")).toBeInTheDocument();
  });

  it("colours reps by rank with a matching dot, as in the concept", () => {
    const { container } = render(
      <RepPerformanceChart reps={[rep("Anna Schmidt", 14_200_000, 67), rep("Tom Weber", 11_600_000, 59)]} />,
    );

    const dots = [...container.querySelectorAll("svg circle")].map((c) => c.getAttribute("fill"));
    expect(dots).toEqual([RANK_COLORS[0], RANK_COLORS[1]]);
  });

  it("pools the remaining reps into an 'others' row below the chart", () => {
    render(
      <RepPerformanceChart
        reps={[rep("Anna Schmidt", 14_200_000, 67), rep("48 others", 37_000_000, 58, 9000, true)]}
      />,
    );

    expect(screen.getByText("48 others")).toBeInTheDocument();
    expect(screen.getByText("€37.0M")).toBeInTheDocument();
    expect(screen.getByText("avg 58% win rate")).toBeInTheDocument();
  });

  it("truncates long rep names and keeps the full name as a hover title", () => {
    const { container } = render(<RepPerformanceChart reps={[rep("Load Test Rep 12 Extended Name", 5000, 50)]} />);
    const svg = container.querySelector<HTMLElement>("svg")!;

    expect(within(svg).getByText("Load Test Rep 12…", { ignore: "title" })).toBeInTheDocument();
    expect(svg.querySelector("text > title")).toHaveTextContent("Load Test Rep 12 Extended Name");
  });

  it("shows an empty state when no rep has sent anything", () => {
    render(<RepPerformanceChart reps={[]} />);
    expect(screen.getByText("No quotations sent in this period")).toBeInTheDocument();
  });
});
