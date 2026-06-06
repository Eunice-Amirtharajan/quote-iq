import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing/react";
import { vi } from "vitest";
import AIInsightCard from "./AIInsightCard";
import { QUOTATION_SUMMARY_MUTATION } from "../graphql/mutations";
import { ASK_ABOUT_QUOTATION_QUERY } from "../graphql/queries";
import { AuthContext, type User } from "../context/auth-context";
import type { MockLink } from "@apollo/client/testing";

const mockManager = {
  id: "u-1",
  name: "Marcus Klein",
  email: "marcus@quoteiq.com",
  role: "SALES_MANAGER" as const,
};

const mockRep = {
  id: "u-2",
  name: "Anna Schmidt",
  email: "anna@quoteiq.com",
  role: "SALES_REP" as const,
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
      query: QUOTATION_SUMMARY_MUTATION,
      variables: { quotationId: "q-1" },
    },
    result: { data: { quotationSummary: mockSummary } },
  },
];

const renderCard = (
  user: User = mockManager,
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

  it("shows generate button initially for manager", () => {
    renderCard(mockManager);
    expect(screen.getByRole("button", { name: /generate insight/i })).toBeInTheDocument();
  });

  it("shows loading state while mutation is in flight", async () => {
    const delayedMock: MockLink.MockedResponse[] = [
      {
        request: {
          query: QUOTATION_SUMMARY_MUTATION,
          variables: { quotationId: "q-1" },
        },
        result: { data: { quotationSummary: mockSummary } },
        delay: 200,
      },
    ];
    render(
      <MockedProvider mocks={delayedMock}>
        <AuthContext.Provider value={{ user: mockManager, setUser: vi.fn() }}>
          <AIInsightCard quotationId="q-1" />
        </AuthContext.Provider>
      </MockedProvider>,
    );
    void userEvent.click(screen.getByRole("button", { name: /generate insight/i }));
    expect(await screen.findByText("Analysing...")).toBeInTheDocument();
  });

  it("renders summary after generate is clicked", async () => {
    renderCard(mockManager);
    await userEvent.click(screen.getByRole("button", { name: /generate insight/i }));
    expect(
      await screen.findByText("Strong deal with good client history."),
    ).toBeInTheDocument();
  });

  it("renders PROCEED recommendation badge after generation", async () => {
    renderCard(mockManager);
    await userEvent.click(screen.getByRole("button", { name: /generate insight/i }));
    expect(await screen.findByText("Proceed")).toBeInTheDocument();
  });

  it("renders key points after generation", async () => {
    renderCard(mockManager);
    await userEvent.click(screen.getByRole("button", { name: /generate insight/i }));
    await screen.findByText("Strong deal with good client history.");
    expect(screen.getByText("Client has 80% approval rate")).toBeInTheDocument();
    expect(screen.getByText("Deal size is within normal range")).toBeInTheDocument();
  });

  it("renders risk factors after generation", async () => {
    renderCard(mockManager);
    await userEvent.click(screen.getByRole("button", { name: /generate insight/i }));
    await screen.findByText("Strong deal with good client history.");
    expect(screen.getByText("Payment terms not confirmed")).toBeInTheDocument();
  });

  it("renders RECONSIDER badge correctly", async () => {
    const reconsiderMock: MockLink.MockedResponse[] = [
      {
        request: {
          query: QUOTATION_SUMMARY_MUTATION,
          variables: { quotationId: "q-1" },
        },
        result: {
          data: {
            quotationSummary: { ...mockSummary, recommendation: "RECONSIDER" },
          },
        },
      },
    ];
    renderCard(mockManager, reconsiderMock);
    await userEvent.click(screen.getByRole("button", { name: /generate insight/i }));
    expect(await screen.findByText("Reconsider")).toBeInTheDocument();
  });

  it("renders FOLLOW_UP badge correctly", async () => {
    const followUpMock: MockLink.MockedResponse[] = [
      {
        request: {
          query: QUOTATION_SUMMARY_MUTATION,
          variables: { quotationId: "q-1" },
        },
        result: {
          data: {
            quotationSummary: { ...mockSummary, recommendation: "FOLLOW_UP" },
          },
        },
      },
    ];
    renderCard(mockManager, followUpMock);
    await userEvent.click(screen.getByRole("button", { name: /generate insight/i }));
    expect(await screen.findByText("Follow Up")).toBeInTheDocument();
  });

  it("shows error message when mutation fails", async () => {
    const errorMock: MockLink.MockedResponse[] = [
      {
        request: {
          query: QUOTATION_SUMMARY_MUTATION,
          variables: { quotationId: "q-1" },
        },
        error: new Error("AI service unavailable"),
      },
    ];
    renderCard(mockManager, errorMock);
    await userEvent.click(screen.getByRole("button", { name: /generate insight/i }));
    expect(await screen.findByText(/analysis failed/i)).toBeInTheDocument();
  });

  it("shows Q&A input after insight is generated", async () => {
    renderCard(mockManager);
    await userEvent.click(screen.getByRole("button", { name: /generate insight/i }));
    await screen.findByText("Strong deal with good client history.");
    expect(screen.getByPlaceholderText(/e\.g\. Is the margin/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ask/i })).toBeInTheDocument();
  });

  it("displays answer after Ask is clicked", async () => {
    const mocksWithAnswer: MockLink.MockedResponse[] = [
      ...successMock,
      {
        request: {
          query: ASK_ABOUT_QUOTATION_QUERY,
          variables: {
            quotationId: "q-1",
            question: "Is the margin reasonable?",
          },
        },
        result: {
          data: {
            askAboutQuotation: { answer: "Yes, the margin looks solid." },
          },
        },
      },
    ];
    renderCard(mockManager, mocksWithAnswer);
    await userEvent.click(screen.getByRole("button", { name: /generate insight/i }));
    await screen.findByText("Strong deal with good client history.");

    await userEvent.type(
      screen.getByPlaceholderText(/e\.g\. Is the margin/i),
      "Is the margin reasonable?",
    );
    await userEvent.click(screen.getByRole("button", { name: /ask/i }));

    expect(
      await screen.findByText("Yes, the margin looks solid."),
    ).toBeInTheDocument();
  });

  it("Ask button is disabled when question input is empty", async () => {
    renderCard(mockManager);
    await userEvent.click(screen.getByRole("button", { name: /generate insight/i }));
    await screen.findByText("Strong deal with good client history.");
    // Ask button is disabled until text is entered
    const askBtn = screen.getByRole("button", { name: /^Ask$/ });
    expect(askBtn).toBeDisabled();
  });
});
