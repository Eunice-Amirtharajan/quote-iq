import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing/react";
import { vi } from "vitest";
import type { MockLink } from "@apollo/client/testing";
import PipelineAnalysis from "./PipelineAnalysis";
import {
  DASHBOARD_STATS_QUERY,
  DEAL_VELOCITY_QUERY,
  QUARTERLY_HISTORY_QUERY,
  REP_DEAL_SIZE_WIN_RATES_QUERY,
} from "../../graphql/queries";
import { AuthContext } from "../../context/auth-context";

vi.mock("recharts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("recharts")>()),
  // Imported inside the factory: vi.mock is hoisted above top-level imports
  ResponsiveContainer: (await import("../../test/recharts-mock")).FixedSizeContainer,
}));

const manager = { id: "m", name: "Marcus Klein", email: "marcus@quoteiq.com", role: "SALES_MANAGER" as const };
const rep = { id: "r", name: "Anna Schmidt", email: "anna@quoteiq.com", role: "SALES_REP" as const };

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

const heatCell = (bucket: string, approved: number, rejected: number) => ({
  bucket,
  approved,
  rejected,
  decided: approved + rejected,
  winRate: Math.round((approved / (approved + rejected)) * 1000) / 10,
});
const heatmapPage = (offset: number, names: string[]) => ({
  buckets: ["<5k", "5k–20k", ">20k"],
  totalReps: 12,
  offset,
  limit: 5,
  teamAverage: [heatCell("<5k", 56, 44), heatCell("5k–20k", 64, 36), heatCell(">20k", 60, 40)],
  reps: names.map((name, i) => ({
    repId: `r${offset + i}`,
    repName: name,
    decided: 60,
    winRate: 60,
    cells: [heatCell("<5k", 12, 8), heatCell("5k–20k", 12, 8), heatCell(">20k", 12, 8)],
  })),
});

const hasRange = (v: Record<string, unknown>) => !!(v.range as { from?: string } | undefined)?.from;

const mocks: MockLink.MockedResponse[] = [
  { request: { query: DASHBOARD_STATS_QUERY }, result: { data: { dashboardStats: stats } } },
  { request: { query: DEAL_VELOCITY_QUERY }, result: { data: { dealVelocity } } },
  { request: { query: QUARTERLY_HISTORY_QUERY, variables: { quarters: 4 } }, result: { data: { quarterlyHistory } } },
  {
    request: { query: REP_DEAL_SIZE_WIN_RATES_QUERY, variables: { offset: 0, limit: 5 } },
    result: { data: { repDealSizeWinRates: heatmapPage(0, ["Anna Schmidt", "Tom Muller"]) } },
  },
  {
    request: { query: REP_DEAL_SIZE_WIN_RATES_QUERY, variables: { offset: 5, limit: 5 } },
    result: { data: { repDealSizeWinRates: heatmapPage(5, ["Page Two Rep"]) } },
  },
  {
    request: { query: REP_DEAL_SIZE_WIN_RATES_QUERY, variables: (v: Record<string, unknown>) => hasRange(v) && v.offset === 0 },
    result: { data: { repDealSizeWinRates: heatmapPage(0, ["Range Rep"]) } },
  },
  // Range-driven refetches after the period changes
  {
    request: { query: DASHBOARD_STATS_QUERY, variables: hasRange },
    result: { data: { dashboardStats: { ...stats, totalQuotations: 1200, totalApproved: 300 } } },
  },
  {
    request: { query: DEAL_VELOCITY_QUERY, variables: hasRange },
    result: { data: { dealVelocity: dealVelocity.map((v) => ({ ...v, avgDays: (v.avgDays ?? 0) + 1 })) } },
  },
];

function renderAnalysis(user: typeof manager | typeof rep = manager, m = mocks) {
  return render(
    <AuthContext.Provider value={{ user, setUser: vi.fn() }}>
      <MockedProvider mocks={m}>
        <PipelineAnalysis />
      </MockedProvider>
    </AuthContext.Provider>,
  );
}

describe("PipelineAnalysis", () => {
  it("renders the heatmap, velocity and quarter table — no funnel or concentration panel", async () => {
    renderAnalysis();

    const heatmap = await screen.findByRole("region", { name: "Win Rate by Deal Size" });
    // Each name appears in the SVG and in the screen-reader table
    expect(await within(heatmap).findAllByText("Tom Muller")).not.toHaveLength(0);
    expect(screen.queryByRole("region", { name: "Pipeline Funnel" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Client Concentration" })).not.toBeInTheDocument();
    expect(await within(screen.getByRole("region", { name: "Deal Velocity" })).findByText("11.6d")).toBeInTheDocument();
    const qoq = screen.getByRole("region", { name: "Quarter-on-Quarter" });
    expect(await within(qoq).findByRole("rowheader", { name: /Q3 2026/ })).toBeInTheDocument();
    expect(screen.queryByRole("article")).not.toBeInTheDocument(); // the old card grid is gone
  });

  it("has its own period selector that refetches the range-driven panels", async () => {
    const user = userEvent.setup();
    renderAnalysis();
    await screen.findByText("11.6d");

    await user.click(within(screen.getByRole("group", { name: "Analysis period" })).getByRole("button", { name: "Last 90 days" }));

    expect(screen.getByText("Win rates by deal size, cycle times and quarterly history · last 90 days")).toBeInTheDocument();
    expect(await screen.findByText("12.6d")).toBeInTheDocument(); // velocity refetched with the range
    // stats refetched with the range: 300 approved of (5,000 + 300 + 14,000) sent
    expect(await screen.findByText("1.6%")).toBeInTheDocument();
    expect(await screen.findAllByText("Range Rep")).not.toHaveLength(0); // heatmap refetched, back on page 1
  });

  it("isolates a failing panel", async () => {
    renderAnalysis(manager, [
      ...mocks.filter((m) => m.request.query !== DEAL_VELOCITY_QUERY),
      { request: { query: DEAL_VELOCITY_QUERY }, error: new Error("Failed to fetch") },
    ]);

    expect(await screen.findByText("Couldn't load deal velocity")).toBeInTheDocument();
    expect(await screen.findByRole("rowheader", { name: /Q3 2026/ })).toBeInTheDocument();
  });

  it("renders nothing for a sales rep", () => {
    const { container } = renderAnalysis(rep, []);
    expect(container).toBeEmptyDOMElement();
  });

  it("summarises stage conversion in one line instead of a funnel", async () => {
    renderAnalysis();

    const line = await screen.findByLabelText("Stage conversion");
    // 40,000 of 50,000 sent; 21,000 / 14,000 / 5,000 of the 40,000 sent
    expect(line).toHaveTextContent("80.0% of quotes are sent · 52.5% of sent are approved · 35.0% rejected · 12.5% awaiting a decision");
  });

  it("pages the heatmap without refetching the other panels", async () => {
    const user = userEvent.setup();
    renderAnalysis();
    await screen.findAllByText("Tom Muller");

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findAllByText("Page Two Rep")).not.toHaveLength(0);
    expect(screen.getByText("6–6 of 12 reps")).toBeInTheDocument();
    expect(screen.getByText("11.6d")).toBeInTheDocument(); // velocity untouched
  });
});
