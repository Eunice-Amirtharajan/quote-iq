import { render, screen, waitFor } from "@testing-library/react";
import { MockedProvider } from "@apollo/client/testing/react";
import WinLossPage from "./WinLossPage";
import { WIN_LOSS_ANALYSIS_QUERY } from "../graphql/queries";

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
      approvalRate: 70.0,
    },
    {
      repName: "Bob",
      sent: 5,
      approved: 3,
      rejected: 2,
      approvalRate: 60.0,
    },
  ],
  byDealSize: [
    { bucket: "<5k", total: 6, approved: 4, approvalRate: 66.7 },
    { bucket: "5k–20k", total: 7, approved: 5, approvalRate: 71.4 },
    { bucket: ">20k", total: 2, approved: 1, approvalRate: 50.0 },
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

  it("renders byRep table with all reps", async () => {
    renderPage([successMock]);
    expect(await screen.findByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("By Sales Rep")).toBeInTheDocument();
  });

  it("renders byDealSize table with all buckets", async () => {
    renderPage([successMock]);
    expect(await screen.findByText("<5k")).toBeInTheDocument();
    expect(screen.getByText("5k–20k")).toBeInTheDocument();
    expect(screen.getByText(">20k")).toBeInTheDocument();
    expect(screen.getByText("By Deal Size")).toBeInTheDocument();
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
});
