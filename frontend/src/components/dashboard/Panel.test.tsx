import { render, screen } from "@testing-library/react";
import Panel from "./Panel";

describe("Panel", () => {
  it("renders the title, meta and content", () => {
    render(
      <Panel title="Deal Velocity" meta="days per stage" loading={false} hasData>
        <p>content</p>
      </Panel>,
    );

    expect(screen.getByRole("region", { name: "Deal Velocity" })).toBeInTheDocument();
    expect(screen.getByText("days per stage")).toBeInTheDocument();
    expect(screen.getByText("content")).toBeInTheDocument();
  });

  it("shows a skeleton on first load", () => {
    render(
      <Panel title="Deal Velocity" loading hasData={false}>
        <p>content</p>
      </Panel>,
    );

    expect(screen.getByLabelText("Loading deal velocity")).toBeInTheDocument();
    expect(screen.queryByText("content")).not.toBeInTheDocument();
  });

  it("keeps the previous content visible, dimmed, while refetching", () => {
    render(
      <Panel title="Deal Velocity" loading hasData>
        <p>content</p>
      </Panel>,
    );

    expect(screen.getByText("content").parentElement).toHaveClass("opacity-60");
    expect(screen.queryByLabelText("Loading deal velocity")).not.toBeInTheDocument();
  });

  it("shows an error only when there is nothing to fall back on", () => {
    const { rerender } = render(
      <Panel title="Deal Velocity" loading={false} error={new Error("boom")} hasData={false}>
        <p>content</p>
      </Panel>,
    );
    expect(screen.getByText("Couldn't load deal velocity")).toBeInTheDocument();

    rerender(
      <Panel title="Deal Velocity" loading={false} error={new Error("boom")} hasData>
        <p>content</p>
      </Panel>,
    );
    expect(screen.getByText("content")).toBeInTheDocument();
  });

  it("renders a badge next to the title", () => {
    render(
      <Panel title="Stale Pipeline" tone="stale" badge={<span>23 quotes</span>} loading={false} hasData>
        <p>content</p>
      </Panel>,
    );
    expect(screen.getByText("23 quotes")).toBeInTheDocument();
  });
});
