import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing/react";
import { vi } from "vitest";
import DashboardPage from "./DashboardPage";
import { DASHBOARD_STATS_QUERY } from "../graphql/queries";
import { AuthContext } from "../context/auth-context";
import type { MockLink } from "@apollo/client/testing";

const mockRep = {
  id: "u-rep",
  name: "Anna Schmidt",
  email: "anna@quoteiq.com",
  role: "SALES_REP" as const,
};
const mockManager = {
  id: "u-manager",
  name: "Marcus Klein",
  email: "marcus@quoteiq.com",
  role: "SALES_MANAGER" as const,
};
const mockSetUser = vi.fn();

const mockStats = {
  totalQuotations: 9,
  totalSent: 2,
  totalApproved: 3,
  totalRejected: 3,
  conversionRate: 33.3,
  totalPipelineValue: 32412,
  totalApprovedValue: 31980,
};

const successMock: MockLink.MockedResponse[] = [
  {
    request: { query: DASHBOARD_STATS_QUERY },
    result: { data: { dashboardStats: mockStats } },
  },
];

const errorMock: MockLink.MockedResponse[] = [
  {
    request: { query: DASHBOARD_STATS_QUERY },
    error: new Error("Failed to fetch"),
  },
];

describe("DashboardPage", () => {
  it("shows loading state initially", () => {
    render(
      <AuthContext.Provider value={{ user: mockManager, setUser: mockSetUser }}>
        <MockedProvider mocks={successMock}>
          <DashboardPage />
        </MockedProvider>
        ,
      </AuthContext.Provider>,
    );
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("renders stats after loading", async () => {
    render(
      <AuthContext.Provider value={{ user: mockManager, setUser: mockSetUser }}>
        <MockedProvider mocks={successMock}>
          <DashboardPage />
        </MockedProvider>
        ,
      </AuthContext.Provider>,
    );

    expect(await screen.findByText("9")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("33.3%")).toBeInTheDocument();
  });

  it("renders pipeline and approved values", async () => {
    render(
      <AuthContext.Provider value={{ user: mockManager, setUser: mockSetUser }}>
        <MockedProvider mocks={successMock}>
          <DashboardPage />
        </MockedProvider>
      </AuthContext.Provider>,
    );

    expect(await screen.findByText("€32,412")).toBeInTheDocument();
    expect(screen.getByText("€31,980")).toBeInTheDocument();
  });

  it("renders all stat card labels", async () => {
    render(
      <AuthContext.Provider value={{ user: mockManager, setUser: mockSetUser }}>
        <MockedProvider mocks={successMock}>
          <DashboardPage />
        </MockedProvider>
      </AuthContext.Provider>,
    );

    await screen.findByText("9");
    expect(screen.getByText("Total Quotations")).toBeInTheDocument();
    expect(screen.getByText("Sent")).toBeInTheDocument();
    expect(screen.getByText("Approved")).toBeInTheDocument();
    expect(screen.getByText("Conversion Rate")).toBeInTheDocument();
    expect(screen.getByText("Pipeline Value")).toBeInTheDocument();
    expect(screen.getByText("Approved Value")).toBeInTheDocument();
  });

  it("shows error state when query fails", async () => {
    render(
      <AuthContext.Provider value={{ user: mockManager, setUser: mockSetUser }}>
        <MockedProvider mocks={errorMock}>
          <DashboardPage />
        </MockedProvider>
      </AuthContext.Provider>,
    );

    expect(
      await screen.findByText("Failed to load dashboard stats"),
    ).toBeInTheDocument();
  });

  it("skips query and shows zeros for SALES_REP", async () => {
    render(
      <AuthContext.Provider value={{ user: mockRep, setUser: mockSetUser }}>
        <MockedProvider mocks={[]}>
          <DashboardPage />
        </MockedProvider>
      </AuthContext.Provider>,
    );
    expect(await screen.findByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("0%")).toBeInTheDocument();
    expect(screen.getAllByText("€0")).toHaveLength(2);
  });

  it("clicking a period button shows the trend hint text", async () => {
    const user = userEvent.setup();
    // SALES_REP skips the data query entirely — safe for testing period UI state
    render(
      <AuthContext.Provider value={{ user: mockRep, setUser: mockSetUser }}>
        <MockedProvider mocks={[]}>
          <DashboardPage />
        </MockedProvider>
      </AuthContext.Provider>,
    );
    await screen.findByText("Dashboard");

    // default is "all" — no hint text
    expect(screen.queryByText(/trend indicators compare/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Last 30 days" }));

    // hint text renders synchronously once period state changes
    expect(screen.getByText(/trend indicators compare/i)).toBeInTheDocument();
  });

  it("renders TrendBadge with up trend", async () => {
    const statsWithTrend = {
      ...mockStats,
      totalQuotationsTrend: { direction: "up", pct: 12 },
    };
    const trendMock: MockLink.MockedResponse[] = [
      {
        request: { query: DASHBOARD_STATS_QUERY },
        result: { data: { dashboardStats: statsWithTrend } },
      },
    ];
    render(
      <AuthContext.Provider value={{ user: mockManager, setUser: mockSetUser }}>
        <MockedProvider mocks={trendMock}>
          <DashboardPage />
        </MockedProvider>
      </AuthContext.Provider>,
    );
    expect(await screen.findByText(/12% vs prev period/i)).toBeInTheDocument();
  });

  it("renders TrendBadge with flat trend", async () => {
    const statsWithFlat = {
      ...mockStats,
      totalQuotationsTrend: { direction: "flat", pct: 0 },
    };
    const flatMock: MockLink.MockedResponse[] = [
      {
        request: { query: DASHBOARD_STATS_QUERY },
        result: { data: { dashboardStats: statsWithFlat } },
      },
    ];
    render(
      <AuthContext.Provider value={{ user: mockManager, setUser: mockSetUser }}>
        <MockedProvider mocks={flatMock}>
          <DashboardPage />
        </MockedProvider>
      </AuthContext.Provider>,
    );
    expect(await screen.findByText(/no change/i)).toBeInTheDocument();
  });
});
