import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ErrorBoundary from "./ErrorBoundary";

let shouldThrow = true;
function Flaky() {
  if (shouldThrow) throw new Error("boom");
  return <p>page content</p>;
}

describe("ErrorBoundary", () => {
  beforeEach(() => {
    shouldThrow = true;
    // React logs every error a boundary catches
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("shows a retry panel instead of unmounting when a child throws", () => {
    render(<ErrorBoundary><Flaky /></ErrorBoundary>);
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong on this page.");
  });

  it("renders the children again after Try again", async () => {
    render(<ErrorBoundary><Flaky /></ErrorBoundary>);
    shouldThrow = false;
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByText("page content")).toBeInTheDocument();
  });

  it("clears the error when resetKey changes", () => {
    const { rerender } = render(<ErrorBoundary resetKey="/a"><Flaky /></ErrorBoundary>);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    shouldThrow = false;
    rerender(<ErrorBoundary resetKey="/b"><Flaky /></ErrorBoundary>);
    expect(screen.getByText("page content")).toBeInTheDocument();
  });

  it("keeps the error while resetKey is unchanged", () => {
    const { rerender } = render(<ErrorBoundary resetKey="/a"><Flaky /></ErrorBoundary>);
    shouldThrow = false;
    rerender(<ErrorBoundary resetKey="/a"><Flaky /></ErrorBoundary>);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});
