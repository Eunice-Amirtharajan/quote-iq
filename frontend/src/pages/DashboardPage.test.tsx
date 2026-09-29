import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import type { DocumentNode } from "graphql";
import DashboardPage from "./DashboardPage";
import {
  APPROVAL_RATE_TREND_QUERY,
  CLIENT_CONCENTRATION_QUERY,
  DASHBOARD_STATS_QUERY,
  DEAL_VELOCITY_QUERY,
  QUARTERLY_HISTORY_QUERY,
  REP_PERFORMANCE_QUERY,
  STALE_QUOTATIONS_QUERY,
} from "../graphql/queries";
import { AuthContext } from "../context/auth-context";
import type { MockLink } from "@apollo/client/testing";

vi.mock("recharts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("recharts")>()),
  // Imported inside the factory: vi.mock is hoisted above top-level imports
  ResponsiveContainer: (await import("../test/recharts-mock")).FixedSizeContainer,
}));

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

const stats = {
  totalQuotations: 50000,
  totalSent: 5000,
  totalApproved: 21000,
  totalRejected: 14000,
  conversionRate: 60,
  totalPipelineValue: 32_400_000,
  totalApprovedValue: 51_800_000,
  avgDealSize: 18450,
  medianDealSize: 14200,
  p90DealSize: 42100,
  totalQuotationsTrend: null,
  conversionRateTrend: null,
  totalPipelineValueTrend: null,
  totalApprovedValueTrend: null,
  avgDealSizeTrend: null,
};

const repPerformance = [
  {
    repId: "u-anna",
    repName: "Anna Schmidt",
    isOthers: false,
    totalSent: 400,
    totalApproved: 300,
    approvedRevenue: 14_200_000,
    winRate: 67,
  },
];

const approvalRateTrend = [
  { month: "2026-08", sent: 20, approved: 6, rejected: 2, rate: 75 },
  { month: "2026-09", sent: 20, approved: 8, rejected: 2, rate: 80 },
];

const staleQuotations = {
  thresholdDays: 14,
  totalCount: 72,
  totalValue: 2_534_830,
  items: [
    {
      id: "q-1",
      quotationNumber: "QT-2026-0847",
      title: "Cloud Migration",
      clientId: "c-1",
      clientName: "Bauer Logistics",
      repName: "Anna Schmidt",
      total: 38200,
      sentAt: "2026-08-28T10:00:00.000Z",
      daysStale: 31,
    },
  ],
};

const clientConcentration = [
  { clientId: "c-1", clientName: "Bauer Logistics", approvedRevenue: 28_600_000, shareOfTotal: 34, quoteCount: 40 },
];

const dealVelocity = [
  { transition: "DRAFT_TO_SENT", avgDays: 3, p90Days: 5.8, sampleSize: 3032 },
  { transition: "SENT_TO_APPROVED", avgDays: 11.6, p90Days: 20.9, sampleSize: 2083 },
  { transition: "SENT_TO_REJECTED", avgDays: 20.1, p90Days: 32.9, sampleSize: 599 },
  { transition: "FULL_CYCLE", avgDays: 16.5, p90Days: 26.9, sampleSize: 2682 },
];

const quarterlyHistory = [
  {
    quarter: "Q3 2026",
    from: "2026-07-01T00:00:00.000Z",
    to: "2026-09-30T23:59:59.999Z",
    isCurrent: true,
    totalQuotations: 2167,
    totalApproved: 877,
    pipelineValue: 40_000_000,
    approvedRevenue: 32_000_000,
    winRate: 79.5,
    avgDealSize: 36487,
  },
];

/** Default page mocks — any query can be overridden by name */
function pageMocks(overrides: Partial<Record<string, MockLink.MockedResponse>> = {}): MockLink.MockedResponse[] {
  const ok = (query: DocumentNode, data: Record<string, unknown>): MockLink.MockedResponse => ({
    request: { query },
    result: { data },
  });
  const defaults: Record<string, MockLink.MockedResponse> = {
    stats: ok(DASHBOARD_STATS_QUERY, { dashboardStats: stats }),
    reps: {
      request: { query: REP_PERFORMANCE_QUERY, variables: { limit: 5 } },
      result: { data: { repPerformance } },
    },
    trend: ok(APPROVAL_RATE_TREND_QUERY, { approvalRateTrend }),
    stale: {
      request: { query: STALE_QUOTATIONS_QUERY, variables: { thresholdDays: 14 } },
      result: { data: { staleQuotations } },
    },
    clients: ok(CLIENT_CONCENTRATION_QUERY, { clientConcentration }),
    velocity: ok(DEAL_VELOCITY_QUERY, { dealVelocity }),
    quarters: {
      request: { query: QUARTERLY_HISTORY_QUERY, variables: { quarters: 4 } },
      result: { data: { quarterlyHistory } },
    },
  };
  return Object.values({ ...defaults, ...overrides }).filter((m): m is MockLink.MockedResponse => !!m);
}

function renderPage(mocks: MockLink.MockedResponse[], user: typeof mockManager | typeof mockRep = mockManager) {
  return render(
    <AuthContext.Provider value={{ user, setUser: mockSetUser }}>
      <MockedProvider mocks={mocks}>
        <MemoryRouter>
          <DashboardPage />
        </MemoryRouter>
      </MockedProvider>
    </AuthContext.Provider>,
  );
}

describe("DashboardPage", () => {
  it("shows loading placeholders before data arrives", () => {
    renderPage(pageMocks());

    expect(screen.getByLabelText("Loading total pipeline")).toBeInTheDocument();
    expect(screen.getByLabelText("Loading rep performance")).toBeInTheDocument();
    expect(screen.getByLabelText("Loading stale pipeline")).toBeInTheDocument();
  });

  it("renders the KPI tiles from dashboardStats and staleQuotations", async () => {
    renderPage(pageMocks());

    // Total Pipeline = open (€32.4M) + approved (€51.8M)
    expect(await screen.findByText("€84.2M")).toBeInTheDocument();
    expect(screen.getByText("€51.8M approved · €32.4M open")).toBeInTheDocument();
    expect(screen.getByText("60%")).toBeInTheDocument();
    expect(screen.getByText("21,000 approved / 35,000 decided")).toBeInTheDocument();
    expect(screen.getByText("€18,450")).toBeInTheDocument();
    expect(screen.getByText("median €14,200 · p90 €42,100")).toBeInTheDocument();
    expect(await screen.findByText("€2.5M at risk")).toBeInTheDocument();
    expect(screen.getByText("SENT · no response >14 days")).toBeInTheDocument();
    expect(screen.getByText("50,000 quotations · all time")).toBeInTheDocument();
  });

  it("renders the daily panels once their queries resolve", async () => {
    renderPage(pageMocks());

    const rep = await screen.findByRole("region", { name: "Rep Performance" });
    expect(await within(rep).findByText("67% · 300 deals")).toBeInTheDocument();

    const trend = screen.getByRole("region", { name: "Approval Rate Trend" });
    expect(await within(trend).findByText("Sep · 80%")).toBeInTheDocument();

    const stale = screen.getByRole("region", { name: "Stale Pipeline" });
    expect(await within(stale).findByRole("link", { name: "QT-2026-0847" })).toBeInTheDocument();
    expect(within(stale).getByText("72 quotes")).toBeInTheDocument();
  });

  it("keeps analysis panels off the dashboard and points to Win/Loss instead", async () => {
    renderPage(pageMocks());
    await screen.findByText("67% · 300 deals");

    for (const moved of ["Pipeline Funnel", "Client Concentration", "Deal Velocity"]) {
      expect(screen.queryByRole("region", { name: moved })).not.toBeInTheDocument();
    }
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Win/Loss" })).toHaveAttribute("href", "/winloss");
  });

  it("orders the page: KPIs, then the stale action list, then reps and trend", async () => {
    renderPage(pageMocks());
    await screen.findByText("67% · 300 deals");

    const regions = screen.getAllByRole("region").map((r) => r.getAttribute("aria-label"));
    expect(regions).toEqual(["Stale Pipeline", "Rep Performance", "Approval Rate Trend"]);
  });

  it("shows a concentration warning only when one client reaches 34% of revenue", async () => {
    renderPage(pageMocks()); // default mock: Bauer Logistics at 34%

    const warning = await screen.findByText(/Bauer Logistics accounts for 34% of approved revenue/);
    expect(warning.closest("p")).toHaveAttribute("role", "status");
    expect(screen.getByRole("link", { name: "See client concentration →" })).toHaveAttribute("href", "/winloss");
  });

  it("shows no concentration warning for a spread-out client base", async () => {
    renderPage(
      pageMocks({
        clients: {
          request: { query: CLIENT_CONCENTRATION_QUERY },
          result: { data: { clientConcentration: [{ ...clientConcentration[0], shareOfTotal: 25 }] } },
        },
      }),
    );

    await screen.findByText("67% · 300 deals");
    expect(screen.queryByText(/Concentration risk/)).not.toBeInTheDocument();
  });

  it("isolates a failing panel so the rest of the dashboard still renders", async () => {
    renderPage(
      pageMocks({
        trend: { request: { query: APPROVAL_RATE_TREND_QUERY }, error: new Error("Failed to fetch") },
      }),
    );

    expect(await screen.findByText("Couldn't load approval rate trend")).toBeInTheDocument();
    expect(await screen.findByText("67% · 300 deals")).toBeInTheDocument();
  });

  it("shows the stats error in place of the KPI row", async () => {
    renderPage(
      pageMocks({
        stats: { request: { query: DASHBOARD_STATS_QUERY }, error: new Error("Failed to fetch") },
      }),
    );

    expect(await screen.findByText("Failed to load dashboard stats")).toBeInTheDocument();
    // Other panels are unaffected by the stats failure
    expect(await screen.findByText("67% · 300 deals")).toBeInTheDocument();
  });

  it("shows approval-rate trends in percentage points", async () => {
    renderPage(
      pageMocks({
        stats: {
          request: { query: DASHBOARD_STATS_QUERY },
          result: {
            data: {
              dashboardStats: {
                ...stats,
                conversionRateTrend: { delta: 3.1, pct: 5.4, direction: "up" },
                avgDealSizeTrend: { delta: -410, pct: -2.2, direction: "down" },
                totalPipelineValueTrend: { delta: 0, pct: 0, direction: "flat" },
                totalApprovedValueTrend: { delta: 0, pct: 0, direction: "flat" },
              },
            },
          },
        },
      }),
    );

    expect(await screen.findByText("↑ 3.1 pp")).toBeInTheDocument();
    expect(screen.getByText("↓ 2.2%")).toBeInTheDocument();
    // Total Pipeline combines the open and approved trends — both flat here
    expect(screen.getByText("→ no change")).toBeInTheDocument();
  });

  it("refetches range-driven panels when the period changes", async () => {
    const user = userEvent.setup();
    const hasRange = (v: Record<string, unknown>) => !!(v.range as { from?: string } | undefined)?.from;
    renderPage(
      pageMocks().concat([
        {
          request: { query: DASHBOARD_STATS_QUERY, variables: hasRange },
          result: { data: { dashboardStats: { ...stats, totalPipelineValue: 1_200_000 } } },
        },
        {
          request: { query: REP_PERFORMANCE_QUERY, variables: hasRange },
          result: { data: { repPerformance: [{ ...repPerformance[0], approvedRevenue: 900_000 }] } },
        },
        {
          request: { query: CLIENT_CONCENTRATION_QUERY, variables: hasRange },
          result: { data: { clientConcentration } },
        },
        {
          request: { query: DEAL_VELOCITY_QUERY, variables: hasRange },
          result: { data: { dealVelocity } },
        },
      ]),
    );
    await screen.findByText("€84.2M");

    await user.click(screen.getByRole("button", { name: "Last 30 days" }));

    expect(screen.getByRole("button", { name: "Last 30 days" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/quotations · last 30 days$/)).toBeInTheDocument(); // header subtitle follows the period
    expect(await screen.findByText("€53.0M")).toBeInTheDocument(); // €1.2M open + €51.8M approved
    expect(await screen.findByText("€900.0K")).toBeInTheDocument();
    expect(screen.getByText("approved revenue + win rate · last 30 days")).toBeInTheDocument();
  });

  it("skips every query and explains access for SALES_REP", async () => {
    renderPage([], mockRep);

    expect(await screen.findByText("Pipeline analytics are available to sales managers.")).toBeInTheDocument();
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });
});
