import { render, screen } from "@testing-library/react";
import { MockedProvider,  } from "@apollo/client/testing/react";
import DashboardPage from "./DashboardPage";
import { DASHBOARD_STATS_QUERY } from "../graphql/queries";
import type { MockLink } from "@apollo/client/testing";

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
      <MockedProvider mocks={successMock}>
        <DashboardPage />
      </MockedProvider>,
    );
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("renders stats after loading", async () => {
    render(
      <MockedProvider mocks={successMock}>
        <DashboardPage />
      </MockedProvider>,
    );

    expect(await screen.findByText("9")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("33.3%")).toBeInTheDocument();
  });

  it("renders pipeline and approved values", async () => {
    render(
      <MockedProvider mocks={successMock}>
        <DashboardPage />
      </MockedProvider>,
    );

    expect(await screen.findByText("€32,412")).toBeInTheDocument();
    expect(screen.getByText("€31,980")).toBeInTheDocument();
  });

  it("renders all stat card labels", async () => {
    render(
      <MockedProvider mocks={successMock}>
        <DashboardPage />
      </MockedProvider>,
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
      <MockedProvider mocks={errorMock}>
        <DashboardPage />
      </MockedProvider>,
    );

    expect(
      await screen.findByText("Failed to load dashboard stats"),
    ).toBeInTheDocument();
  });
});
