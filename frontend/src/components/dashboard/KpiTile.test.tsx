import { render, screen } from "@testing-library/react";
import KpiTile, { DeltaPill } from "./KpiTile";

describe("KpiTile", () => {
  it("renders label, value, sub-line and pill with the accent bar", () => {
    const { container } = render(
      <KpiTile
        label="Total Pipeline"
        value="€84.2M"
        sub="€51.8M approved · €32.4M open"
        accent="#3b82f6"
        loading={false}
        pill={<DeltaPill tone="up">↑ 12.4% vs prev 90d</DeltaPill>}
      />,
    );

    expect(screen.getByText("Total Pipeline")).toBeInTheDocument();
    expect(screen.getByText("€84.2M")).toBeInTheDocument();
    expect(screen.getByText("€51.8M approved · €32.4M open")).toBeInTheDocument();
    expect(screen.getByText("↑ 12.4% vs prev 90d")).toHaveClass("text-dash-pos", "bg-dash-pos-bg");
    expect(container.querySelector('[aria-hidden="true"]')).toHaveStyle({ backgroundColor: "#3b82f6" });
  });

  it("shows a placeholder instead of the value while loading", () => {
    render(<KpiTile label="Approval Rate" value="60%" accent="#10b981" loading />);

    expect(screen.getByLabelText("Loading approval rate")).toBeInTheDocument();
    expect(screen.queryByText("60%")).not.toBeInTheDocument();
  });

  it.each([
    ["down", "text-dash-neg"],
    ["flat", "text-dash-faint"],
    ["stale", "text-dash-stale"],
  ] as const)("styles a %s pill", (tone, className) => {
    render(<DeltaPill tone={tone}>pill</DeltaPill>);
    expect(screen.getByText("pill")).toHaveClass(className);
  });
});
