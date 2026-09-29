import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing/react";
import { vi } from "vitest";
import WinLossPage from "./WinLossPage";
import { WIN_LOSS_ANALYSIS_QUERY } from "../graphql/queries";

// Pipeline Analysis has its own tests and queries; stub it so this suite stays focused
vi.mock("../components/dashboard/PipelineAnalysis", () => ({ default: () => <div>PipelineAnalysis section</div> }));

const mockStats = {
  approvalRate: 66.7,
  avgApprovedDeal: 12000,
  avgRejectedDeal: 8500,
  byRep: [
    {
      repName: "Alice",
      sent: 10,
      approved: 7,
      rejected: 3,
      approvalRate: 70,
    },
    {
      repName: "Bob",
      sent: 5,
      approved: 3,
      rejected: 2,
      approvalRate: 60,
    },
  ],
};

const successMock = {
  request: { query: WIN_LOSS_ANALYSIS_QUERY },
  result: { data: { winLossAnalysis: mockStats } },
};

const errorMock = {
  request: { query: WIN_LOSS_ANALYSIS_QUERY },
  error: new Error("Network error"),
};

function renderPage(mocks: any[]) { // eslint-disable-line @typescript-eslint/no-explicit-any
  return render(
    <MockedProvider mocks={mocks}>
      <WinLossPage />
    </MockedProvider>,
  );
}

describe("WinLossPage", () => {
  it("shows loading state initially", () => {
    renderPage([successMock]);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("renders summary stats after data loads", async () => {
    renderPage([successMock]);
    expect(await screen.findByText("Overall approval rate")).toBeInTheDocument();
    expect(screen.getByText(/12,000/)).toBeInTheDocument();
    expect(screen.getByText(/8,500/)).toBeInTheDocument();
  });

  it("renders the pipeline analysis section below the win/loss tables", async () => {
    renderPage([successMock]);
    expect(await screen.findByText("PipelineAnalysis section")).toBeInTheDocument();
  });

  it("renders byRep table with all reps", async () => {
    renderPage([successMock]);
    expect(await screen.findByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("By Sales Rep")).toBeInTheDocument();
  });

  it("no longer renders a separate By Deal Size table — the heatmap covers it", async () => {
    renderPage([successMock]);
    await screen.findByText("Overall approval rate");
    expect(screen.queryByText("By Deal Size")).not.toBeInTheDocument();
  });

  it("shows error message on query failure", async () => {
    renderPage([errorMock]);
    expect(
      await screen.findByText("Failed to load win/loss analysis"),
    ).toBeInTheDocument();
  });

  it("renders nothing when winLossAnalysis is null", async () => {
    const nullDataMock = {
      request: { query: WIN_LOSS_ANALYSIS_QUERY },
      result: { data: { winLossAnalysis: null } },
    };
    renderPage([nullDataMock]);
    // loading clears, but no stats content renders
    await waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());
    expect(screen.queryByText("Overall approval rate")).not.toBeInTheDocument();
  });

  it("shows empty state when no reps", async () => {
    const emptyRepsMock = {
      request: { query: WIN_LOSS_ANALYSIS_QUERY },
      result: {
        data: {
          winLossAnalysis: {
            ...mockStats,
            byRep: [],
          },
        },
      },
    };
    renderPage([emptyRepsMock]);
    expect(await screen.findByText("No data yet")).toBeInTheDocument();
  });

  describe("By Sales Rep pagination", () => {
    const manyReps = Array.from({ length: 12 }, (_, i) => ({
      repName: `Rep ${String(i + 1).padStart(2, "0")}`,
      sent: 10,
      approved: 6,
      rejected: 2,
      approvalRate: 75,
    }));
    const pagedMock = {
      request: { query: WIN_LOSS_ANALYSIS_QUERY },
      result: { data: { winLossAnalysis: { ...mockStats, byRep: manyReps } } },
    };
    const repRows = () => within(screen.getByText("By Sales Rep").closest("div.bg-white")!).getAllByRole("row").slice(1);

    it("shows 5 reps per page with a position summary", async () => {
      renderPage([pagedMock]);
      await screen.findByText("Rep 01");

      expect(repRows()).toHaveLength(5);
      expect(screen.getByText(/Showing 1–5 of 12 reps/)).toBeInTheDocument();
      expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
      expect(screen.queryByText("Rep 06")).not.toBeInTheDocument();
    });

    it("pages forward and back, disabling Next on the last page", async () => {
      const user = userEvent.setup();
      renderPage([pagedMock]);
      await screen.findByText("Rep 01");

      await user.click(screen.getByRole("button", { name: "Next" }));
      expect(screen.getByText("Rep 06")).toBeInTheDocument();
      expect(screen.getByText(/Showing 6–10 of 12 reps/)).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Next" }));
      expect(repRows()).toHaveLength(2);
      expect(screen.getByText(/Showing 11–12 of 12 reps/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();

      await user.click(screen.getByRole("button", { name: "Previous" }));
      expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();
    });

    it("hides the pager when every rep fits on one page", async () => {
      renderPage([successMock]); // 2 reps
      await screen.findByText("Alice");
      expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
    });
  });
});
