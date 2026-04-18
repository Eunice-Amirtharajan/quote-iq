import { render, screen } from "@testing-library/react";
import { MockedProvider } from "@apollo/client/testing/react";
import { vi } from "vitest";
import AIInsightCard from "./AIInsightCard";
import { QUOTATION_SUMMARY_QUERY } from "../graphql/queries";
import { AuthContext } from "../context/AuthContext";
import type { MockLink } from "@apollo/client/testing";

const mockManager = {
  id: "u-1",
  name: "Marcus Klein",
  email: "marcus@quoteiq.com",
  role: "SALES_MANAGER",
};

const mockRep = {
  id: "u-2",
  name: "Anna Schmidt",
  email: "anna@quoteiq.com",
  role: "SALES_REP",
};

const mockSummary = {
  summary: "Strong deal with good client history.",
  recommendation: "PROCEED",
  keyPoints: [
    "Client has 80% approval rate",
    "Deal size is within normal range",
  ],
  riskFactors: ["Payment terms not confirmed"],
};

const successMock: MockLink.MockedResponse[] = [
  {
    request: {
      query: QUOTATION_SUMMARY_QUERY,
      variables: { quotationId: "q-1" },
    },
    result: { data: { quotationSummary: mockSummary } },
  },
];

const renderCard = (
  user = mockManager,
  mocks: MockLink.MockedResponse[] = successMock,
) => {
  return render(
    <MockedProvider mocks={mocks}>
      <AuthContext.Provider value={{ user, setUser: vi.fn() }}>
        <AIInsightCard quotationId="q-1" />
      </AuthContext.Provider>
    </MockedProvider>,
  );
};

describe("AIInsightCard", () => {
  it("renders nothing for SALES_REP", () => {
    const { container } = renderCard(mockRep);
    expect(container.firstChild).toBeNull();
  });

  it("shows loading state initially for manager", () => {
    renderCard(mockManager);
    expect(screen.getByText("Analysing...")).toBeInTheDocument();
  });

  it("renders summary after loading", async () => {
    renderCard(mockManager);
    expect(
      await screen.findByText("Strong deal with good client history."),
    ).toBeInTheDocument();
  });

  it("renders PROCEED recommendation badge", async () => {
    renderCard(mockManager);
    expect(await screen.findByText("Proceed")).toBeInTheDocument();
  });

  it("renders key points", async () => {
    renderCard(mockManager);
    await screen.findByText("Strong deal with good client history.");
    expect(
      screen.getByText("Client has 80% approval rate"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Deal size is within normal range"),
    ).toBeInTheDocument();
  });

  it("renders risk factors", async () => {
    renderCard(mockManager);
    await screen.findByText("Strong deal with good client history.");
    expect(screen.getByText("Payment terms not confirmed")).toBeInTheDocument();
  });

  it("renders RECONSIDER badge correctly", async () => {
    const reconsiderMock: MockLink.MockedResponse[] = [
      {
        request: {
          query: QUOTATION_SUMMARY_QUERY,
          variables: { quotationId: "q-1" },
        },
        result: {
          data: {
            quotationSummary: {
              ...mockSummary,
              recommendation: "RECONSIDER",
            },
          },
        },
      },
    ];

    renderCard(mockManager, reconsiderMock);
    expect(await screen.findByText("Reconsider")).toBeInTheDocument();
  });

  it("renders FOLLOW_UP badge correctly", async () => {
    const followUpMock: MockLink.MockedResponse[] = [
      {
        request: {
          query: QUOTATION_SUMMARY_QUERY,
          variables: { quotationId: "q-1" },
        },
        result: {
          data: {
            quotationSummary: {
              ...mockSummary,
              recommendation: "FOLLOW_UP",
            },
          },
        },
      },
    ];

    renderCard(mockManager, followUpMock);
    expect(await screen.findByText("Follow Up")).toBeInTheDocument();
  });
});
