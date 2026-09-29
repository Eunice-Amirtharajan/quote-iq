import { render, screen, within } from "@testing-library/react";
import { vi } from "vitest";
import ApprovalRateTrendChart from "./ApprovalRateTrendChart";
import type { ApprovalRateMonth } from "./analytics";

vi.mock("recharts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("recharts")>()),
  // Imported inside the factory: vi.mock is hoisted above top-level imports
  ResponsiveContainer: (await import("../../test/recharts-mock")).FixedSizeContainer,
}));

const month = (m: string, rate: number | null): ApprovalRateMonth => ({
  month: m,
  sent: 20,
  approved: 6,
  rejected: 2,
  rate,
});

const months = [
  month("2026-06", 70),
  month("2026-07", null),
  month("2026-08", 76.1),
  month("2026-09", 78.6),
];

describe("ApprovalRateTrendChart", () => {
  it("shows peak, trough and month-on-month change", () => {
    render(<ApprovalRateTrendChart months={months} />);

    expect(screen.getByText("Sep · 78.6%")).toHaveClass("text-dash-pos"); // peak
    expect(screen.getByText("Jun · 70%")).toHaveClass("text-dash-neg"); // trough
    expect(screen.getByText("↑ +2.5 pp")).toHaveClass("text-dash-pos");
  });

  it("direct-labels the latest month", () => {
    const { container } = render(<ApprovalRateTrendChart months={months} />);
    expect(within(container.querySelector<HTMLElement>("svg")!).getByText("78.6%")).toBeInTheDocument();
  });

  it("offers every month as an accessible table, marking months with no decisions", () => {
    render(<ApprovalRateTrendChart months={months} />);

    const table = screen.getByRole("table", { name: "Monthly approval rate" });
    expect(within(table).getAllByRole("row")).toHaveLength(5); // header + 4 months
    expect(within(table).getByText("Jul 2026").nextSibling).toHaveTextContent("No decisions");
  });

  it("shows a dash for month-on-month when the previous month had no decisions", () => {
    render(<ApprovalRateTrendChart months={[month("2026-08", null), month("2026-09", 60)]} />);
    expect(screen.getByText("MoM").nextSibling).toHaveTextContent("—");
  });

  it("shows an empty state when nothing was decided all year", () => {
    render(<ApprovalRateTrendChart months={[month("2026-08", null), month("2026-09", null)]} />);
    expect(screen.getByText("No quotations decided in the last 12 months")).toBeInTheDocument();
  });
});
