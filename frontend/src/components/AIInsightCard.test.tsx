import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing/react";
import { vi } from "vitest";
import { GraphQLError } from "graphql";
import AIInsightCard from "./AIInsightCard";
import { QUOTATION_SUMMARY_MUTATION, ASK_ABOUT_QUOTATION_MUTATION } from "../graphql/mutations";
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
  model: "openai/gpt-oss-120b",
  promptVersion: "summary-v1",
  generatedAt: "2026-10-27T09:00:00.000Z",
  stale: false,
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
    // Don't await the click — fire it and immediately assert loading state
    // before the 200ms mock delay resolves and loading flips back to false
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
          query: ASK_ABOUT_QUOTATION_MUTATION,
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

  it("displays answer when Enter is pressed in question input", async () => {
    const mocksWithAnswer: MockLink.MockedResponse[] = [
      ...successMock,
      {
        request: {
          query: ASK_ABOUT_QUOTATION_MUTATION,
          variables: { quotationId: "q-1", question: "Is it profitable?" },
        },
        result: {
          data: { askAboutQuotation: { answer: "Yes, very profitable." } },
        },
      },
    ];
    renderCard(mockManager, mocksWithAnswer);
    await userEvent.click(screen.getByRole("button", { name: /generate insight/i }));
    await screen.findByText("Strong deal with good client history.");
    await userEvent.type(
      screen.getByPlaceholderText(/e\.g\. Is the margin/i),
      "Is it profitable?{Enter}",
    );
    expect(await screen.findByText("Yes, very profitable.")).toBeInTheDocument();
  });
  describe("provenance footer", () => {
    const summaryMock = (overrides: Record<string, unknown>) => [
      {
        request: {
          query: QUOTATION_SUMMARY_MUTATION,
          variables: { quotationId: "q-1" },
        },
        result: { data: { quotationSummary: { ...mockSummary, ...overrides } } },
      },
    ];
    const generate = async () => {
      await userEvent.click(screen.getByRole("button", { name: /generate insight/i }));
      await screen.findByText("Strong deal with good client history.");
    };

    it("shows the model and prompt version that generated the summary", async () => {
      renderCard(mockManager);
      await generate();
      expect(
        screen.getByText("Generated by openai/gpt-oss-120b · prompt summary-v1"),
      ).toBeInTheDocument();
    });

    it("shows only the model when there is no prompt version", async () => {
      renderCard(mockManager, summaryMock({ promptVersion: null }));
      await generate();
      expect(screen.getByText("Generated by openai/gpt-oss-120b")).toBeInTheDocument();
    });

    it("shows no outdated notice for a current summary", async () => {
      renderCard(mockManager);
      await generate();
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });

    it("warns that a stale summary may be outdated, with its date", async () => {
      renderCard(
        mockManager,
        summaryMock({ stale: true, generatedAt: "2026-10-20T09:00:00.000Z" }),
      );
      await generate();
      expect(screen.getByRole("status")).toHaveTextContent(
        "AI is unavailable right now. Showing the summary from 20 Oct 2026, which may be outdated.",
      );
    });

    it("falls back to the generic label when provenance is missing", async () => {
      renderCard(mockManager, summaryMock({ model: null, promptVersion: null }));
      await generate();
      expect(screen.getByText("Powered by Groq AI")).toBeInTheDocument();
    });
  });

  describe("when a question fails", () => {
    const askFails = (
      question: string,
      message: string,
      extensions: Record<string, unknown>,
    ) => [
      ...successMock,
      {
        request: {
          query: ASK_ABOUT_QUOTATION_MUTATION,
          variables: { quotationId: "q-1", question },
        },
        result: { errors: [new GraphQLError(message, { extensions })] },
      },
    ];
    const ask = async (question: string) => {
      await userEvent.click(screen.getByRole("button", { name: /generate insight/i }));
      await screen.findByText("Strong deal with good client history.");
      await userEvent.type(screen.getByPlaceholderText(/e\.g\. Is the margin/i), question);
      await userEvent.click(screen.getByRole("button", { name: /^Ask$/ }));
    };

    it("shows the server's message for a rejected question", async () => {
      renderCard(
        mockManager,
        askFails("hi", "Please ask a question related to this quotation.", {
          code: "BAD_REQUEST",
        }),
      );
      await ask("hi");
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Please ask a question related to this quotation.",
      );
    });

    it("shows the 'temporarily unavailable' message when AI is down", async () => {
      renderCard(
        mockManager,
        askFails(
          "Is it profitable?",
          "The AI service is temporarily unavailable, try again in 30s",
          { code: "INTERNAL_SERVER_ERROR", status: 503 },
        ),
      );
      await ask("Is it profitable?");
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "The AI service is temporarily unavailable, try again in 30s",
      );
    });

    it("shows the daily-limit message when the user is over their AI budget", async () => {
      renderCard(
        mockManager,
        askFails(
          "Is it profitable?",
          "You've reached today's AI limit. It resets at midnight UTC.",
          { code: "INTERNAL_SERVER_ERROR", status: 429 },
        ),
      );
      await ask("Is it profitable?");
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "You've reached today's AI limit. It resets at midnight UTC.",
      );
    });

    it("hides internal error details behind a generic message", async () => {
      renderCard(
        mockManager,
        askFails(
          "Is it profitable?",
          '404 {"error":{"code":"model_not_found"}}',
          { code: "INTERNAL_SERVER_ERROR" },
        ),
      );
      await ask("Is it profitable?");
      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent("Couldn't get an answer. Please try again.");
      expect(alert).not.toHaveTextContent("model_not_found");
    });
  });
});

describe("AIInsightCard — summary errors", () => {
  const summaryFails = (message: string, extensions: Record<string, unknown>) => [
    {
      request: {
        query: QUOTATION_SUMMARY_MUTATION,
        variables: { quotationId: "q-1" },
      },
      result: { errors: [new GraphQLError(message, { extensions })] },
    },
  ];

  it("shows the limit message when generating a summary is rate-limited", async () => {
    renderCard(
      mockManager,
      summaryFails("Too many AI requests. Try again in 45s.", {
        code: "INTERNAL_SERVER_ERROR",
        status: 429,
      }),
    );
    await userEvent.click(screen.getByRole("button", { name: /generate insight/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Too many AI requests. Try again in 45s.",
    );
  });

  it("keeps the generic message for a server error", async () => {
    renderCard(
      mockManager,
      summaryFails("AI response could not be parsed", { code: "INTERNAL_SERVER_ERROR" }),
    );
    await userEvent.click(screen.getByRole("button", { name: /generate insight/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Analysis failed. Please try again.",
    );
  });
});
