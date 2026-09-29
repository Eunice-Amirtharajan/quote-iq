import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import PeriodSelector from "./PeriodSelector";
import { periodToRange } from "./period";

describe("periodToRange", () => {
  const now = new Date(2026, 8, 25, 12, 0, 0); // 25 Sep 2026, local time

  it("sends no range for all time", () => {
    expect(periodToRange("all", now)).toEqual({});
  });

  it("starts 'this month' at local midnight on the 1st", () => {
    expect(periodToRange("month", now)).toEqual({
      from: new Date(2026, 8, 1).toISOString(),
      to: now.toISOString(),
    });
  });

  it.each([
    ["30d", 30],
    ["90d", 90],
  ] as const)("goes back %s days", (period, days) => {
    const { from, to } = periodToRange(period, now);
    expect(to).toBe(now.toISOString());
    expect(new Date(from!).getTime()).toBe(now.getTime() - days * 86_400_000);
  });
});

describe("PeriodSelector", () => {
  it("marks the selected period and reports changes", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<PeriodSelector value="all" onChange={onChange} label="Dashboard period" />);

    expect(screen.getByRole("group", { name: "Dashboard period" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All time" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Last 30 days" })).toHaveAttribute("aria-pressed", "false");

    await user.click(screen.getByRole("button", { name: "Last 30 days" }));
    expect(onChange).toHaveBeenCalledWith("30d");
  });
});
