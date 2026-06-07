import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing/react";
import { vi } from "vitest";
import QuotationDetailPage from "./QuotationDetailPage";
import { QUOTATION_QUERY, STATUS_HISTORY_QUERY } from "../graphql/queries";
import { UPDATE_QUOTATION_STATUS_MUTATION, DELETE_QUOTATION_MUTATION } from "../graphql/mutations";
import { CONVERSION_SCORE_QUERY } from "../graphql/queries";
import { AuthContext } from "../context/auth-context";
import type { MockLink } from "@apollo/client/testing";

const mockManager = {
  id: "u-manager",
  name: "Marcus Klein",
  email: "marcus@quoteiq.com",
  role: "SALES_MANAGER" as const,
};

const mockRep = {
  id: "u-rep",
  name: "Anna Schmidt",
  email: "anna@quoteiq.com",
  role: "SALES_REP" as const,
};

const mockSetUser = vi.fn();

const baseQuotation = {
  id: "q-1",
  quotationNumber: "QT-2026-0001",
  title: "Enterprise License",
  clientName: "Hans Bauer",
  status: "DRAFT",
  notes: "Annual license fee",
  taxRate: 19,
  subtotal: 6000,
  taxAmount: 1140,
  total: 7140,
  createdAt: "2026-04-10T00:00:00.000Z",
  createdBy: {
    id: "u-rep",
    name: "Anna Schmidt",
    email: "anna@quoteiq.com",
    role: "SALES_REP",
  },
  items: [
    {
      id: "i-1",
      description: "Software License",
      quantity: 1,
      unitPrice: 5000,
      lineTotal: 5000,
      sortOrder: 0,
    },
    {
      id: "i-2",
      description: "Support Package",
      quantity: 2,
      unitPrice: 500,
      lineTotal: 1000,
      sortOrder: 1,
    },
  ],
};

const emptyHistoryMock: MockLink.MockedResponse = {
  request: { query: STATUS_HISTORY_QUERY, variables: { quotationId: "q-1" } },
  result: { data: { statusHistory: [] } },
};

const makeMock = (
  quotation: typeof baseQuotation,
): MockLink.MockedResponse[] => [
  {
    request: { query: QUOTATION_QUERY, variables: { id: "q-1" } },
    result: { data: { quotation } },
  },
  emptyHistoryMock,
];

const errorMock: MockLink.MockedResponse[] = [
  {
    request: { query: QUOTATION_QUERY, variables: { id: "q-1" } },
    error: new Error("Failed to fetch"),
  },
];

const mockOnBack = vi.fn();

function renderAs(
  user: typeof mockManager | typeof mockRep,
  mocks: MockLink.MockedResponse[],
) {
  return render(
    <AuthContext.Provider value={{ user, setUser: mockSetUser }}>
      <MockedProvider mocks={mocks}>
        <QuotationDetailPage id="q-1" onBack={mockOnBack} />
      </MockedProvider>
    </AuthContext.Provider>,
  );
}

describe("QuotationDetailPage", () => {
  afterEach(() => vi.clearAllMocks());

  it("shows loading state initially", () => {
    renderAs(mockManager, makeMock(baseQuotation));
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("renders quotation title and status", async () => {
    renderAs(mockManager, makeMock(baseQuotation));
    expect(await screen.findByText("Enterprise License")).toBeInTheDocument();
    expect(screen.getByText("DRAFT")).toBeInTheDocument();
  });

  it("renders line items", async () => {
    renderAs(mockManager, makeMock(baseQuotation));
    await screen.findByText("Enterprise License");
    expect(screen.getByText("Software License")).toBeInTheDocument();
    expect(screen.getByText("Support Package")).toBeInTheDocument();
  });

  it("renders totals correctly", async () => {
    renderAs(mockManager, makeMock(baseQuotation));
    await screen.findByText("Enterprise License");
    expect(screen.getByText("€6,000")).toBeInTheDocument();
    expect(screen.getByText("€1,140")).toBeInTheDocument();
    expect(screen.getByText("€7,140")).toBeInTheDocument();
  });

  it("renders client information", async () => {
    renderAs(mockManager, makeMock(baseQuotation));
    await screen.findByText("Enterprise License");
    expect(screen.getByText("Hans Bauer")).toBeInTheDocument();
  });

  it("renders quotation number and created by", async () => {
    renderAs(mockManager, makeMock(baseQuotation));
    await screen.findByText("Enterprise License");
    expect(screen.getByText("QT-2026-0001")).toBeInTheDocument();
    expect(screen.getByText("Anna Schmidt")).toBeInTheDocument();
  });

  it("renders notes when present", async () => {
    renderAs(mockManager, makeMock(baseQuotation));
    expect(await screen.findByText("Annual license fee")).toBeInTheDocument();
  });

  it("calls onBack when back button clicked", async () => {
    renderAs(mockManager, makeMock(baseQuotation));
    await screen.findByText("Enterprise License");
    screen.getByText("Quotations").click();
    expect(mockOnBack).toHaveBeenCalled();
  });

  it("shows error state when query fails", async () => {
    renderAs(mockManager, errorMock);
    expect(
      await screen.findByText("Failed to load quotation"),
    ).toBeInTheDocument();
  });

  describe("StatusActions", () => {
    it("shows Submit for Approval button for DRAFT quotation owned by rep", async () => {
      renderAs(mockRep, makeMock(baseQuotation));
      expect(await screen.findByText("Submit for Approval")).toBeInTheDocument();
    });

    it("does not show Submit for Approval for manager viewing a DRAFT quotation", async () => {
      renderAs(mockManager, makeMock(baseQuotation));
      await screen.findByText("Enterprise License");
      expect(screen.queryByText("Submit for Approval")).not.toBeInTheDocument();
    });

    it("does not show Submit for Approval for rep who does not own the quotation", async () => {
      const otherRep = { ...mockRep, id: "u-other" };
      renderAs(otherRep, makeMock(baseQuotation));
      await screen.findByText("Enterprise License");
      expect(screen.queryByText("Submit for Approval")).not.toBeInTheDocument();
    });

    it("shows Approve and Reject buttons for SENT quotation viewed by manager", async () => {
      const sentQuotation = { ...baseQuotation, status: "SENT" };
      renderAs(mockManager, makeMock(sentQuotation));
      expect(await screen.findByText("Approve")).toBeInTheDocument();
      expect(screen.getByText("Reject")).toBeInTheDocument();
    });

    it("does not show action buttons for APPROVED quotation", async () => {
      const approvedQuotation = { ...baseQuotation, status: "APPROVED" };
      renderAs(mockManager, makeMock(approvedQuotation));
      await screen.findByText("Enterprise License");
      expect(screen.queryByText("Approve")).not.toBeInTheDocument();
      expect(screen.queryByText("Reject")).not.toBeInTheDocument();
      expect(screen.queryByText("Submit for Approval")).not.toBeInTheDocument();
    });

    it("does not show action buttons for REJECTED quotation", async () => {
      const rejectedQuotation = { ...baseQuotation, status: "REJECTED" };
      renderAs(mockManager, makeMock(rejectedQuotation));
      await screen.findByText("Enterprise License");
      expect(screen.queryByText("Approve")).not.toBeInTheDocument();
    });

    it("calls updateQuotationStatus and refetches on Submit for Approval click", async () => {
      const user = userEvent.setup();
      const sentQuotation = { ...baseQuotation, status: "SENT" };
      const mocks: MockLink.MockedResponse[] = [
        ...makeMock(baseQuotation),
        {
          request: {
            query: UPDATE_QUOTATION_STATUS_MUTATION,
            variables: { id: "q-1", input: { status: "SENT" } },
          },
          result: { data: { updateQuotationStatus: { id: "q-1", status: "SENT" } } },
        },
        ...makeMock(sentQuotation),
      ];

      renderAs(mockRep, mocks);
      await screen.findByText("Submit for Approval");
      await user.click(screen.getByText("Submit for Approval"));

      await waitFor(() => {
        expect(screen.queryByText("Submitting…")).not.toBeInTheDocument();
      });
    });

    it("shows error message when status update fails", async () => {
      const user = userEvent.setup();
      const mocks: MockLink.MockedResponse[] = [
        ...makeMock(baseQuotation),
        {
          request: {
            query: UPDATE_QUOTATION_STATUS_MUTATION,
            variables: { id: "q-1", input: { status: "SENT" } },
          },
          error: new Error("Transition not allowed"),
        },
      ];

      renderAs(mockRep, mocks);
      await screen.findByText("Submit for Approval");
      await user.click(screen.getByText("Submit for Approval"));

      expect(
        await screen.findByText("Transition not allowed"),
      ).toBeInTheDocument();
    });

    it("shows not-found state when quotation data is null", async () => {
      const mockOnBack = vi.fn();
      const mocks: MockLink.MockedResponse[] = [
        {
          request: { query: QUOTATION_QUERY, variables: { id: "q-missing" } },
          result: { data: { quotation: null } },
        },
      ];
      render(
        <AuthContext.Provider value={{ user: mockRep, setUser: vi.fn() }}>
          <MockedProvider mocks={mocks}>
            <QuotationDetailPage id="q-missing" onBack={mockOnBack} />
          </MockedProvider>
        </AuthContext.Provider>,
      );
      expect(await screen.findByText("Quotation not found or access denied.")).toBeInTheDocument();
      await userEvent.setup().click(screen.getByText("← Back to Quotations"));
      expect(mockOnBack).toHaveBeenCalled();
    });

    it("calls updateQuotationStatus with APPROVED when Approve is clicked", async () => {
      const user = userEvent.setup();
      const sentQuotation = { ...baseQuotation, status: "SENT" };
      const approvedQuotation = { ...baseQuotation, status: "APPROVED" };
      const mocks: MockLink.MockedResponse[] = [
        ...makeMock(sentQuotation),
        {
          request: {
            query: UPDATE_QUOTATION_STATUS_MUTATION,
            variables: { id: "q-1", input: { status: "APPROVED" } },
          },
          result: { data: { updateQuotationStatus: { id: "q-1", status: "APPROVED" } } },
        },
        ...makeMock(approvedQuotation),
      ];

      renderAs(mockManager, mocks);
      await screen.findByText("Approve");
      await user.click(screen.getByText("Approve"));

      await waitFor(() => {
        expect(screen.queryByText("Approving…")).not.toBeInTheDocument();
      });
    });

    it("calls updateQuotationStatus with REJECTED when Reject is clicked", async () => {
      const user = userEvent.setup();
      const sentQuotation = { ...baseQuotation, status: "SENT" };
      const rejectedQuotation = { ...baseQuotation, status: "REJECTED" };
      const mocks: MockLink.MockedResponse[] = [
        ...makeMock(sentQuotation),
        {
          request: {
            query: UPDATE_QUOTATION_STATUS_MUTATION,
            variables: { id: "q-1", input: { status: "REJECTED" } },
          },
          result: { data: { updateQuotationStatus: { id: "q-1", status: "REJECTED" } } },
        },
        ...makeMock(rejectedQuotation),
      ];

      renderAs(mockManager, mocks);
      await screen.findByText("Reject");
      await user.click(screen.getByText("Reject"));

      await waitFor(() => {
        expect(screen.queryByText("Rejecting…")).not.toBeInTheDocument();
      });
    });
  });

  describe("delete draft", () => {
    it("shows Delete Draft button for owner of a DRAFT quotation", async () => {
      renderAs(mockRep, makeMock(baseQuotation));
      expect(await screen.findByText("Delete Draft")).toBeInTheDocument();
    });

    it("does not show Delete Draft button for non-owner", async () => {
      renderAs(mockManager, makeMock(baseQuotation));
      await screen.findByText("Enterprise License");
      expect(screen.queryByText("Delete Draft")).not.toBeInTheDocument();
    });

    it("does not show Delete Draft button for non-DRAFT status", async () => {
      renderAs(mockRep, makeMock({ ...baseQuotation, status: "SENT" }));
      await screen.findByText("Enterprise License");
      expect(screen.queryByText("Delete Draft")).not.toBeInTheDocument();
    });

    it("shows confirmation prompt when Delete Draft is clicked", async () => {
      const user = userEvent.setup();
      renderAs(mockRep, makeMock(baseQuotation));
      await user.click(await screen.findByText("Delete Draft"));
      expect(screen.getByText("Delete this draft permanently?")).toBeInTheDocument();
      expect(screen.getByText("Yes, delete")).toBeInTheDocument();
      expect(screen.getByText("Cancel")).toBeInTheDocument();
    });

    it("hides confirmation when Cancel is clicked", async () => {
      const user = userEvent.setup();
      renderAs(mockRep, makeMock(baseQuotation));
      await user.click(await screen.findByText("Delete Draft"));
      await user.click(screen.getByText("Cancel"));
      expect(screen.queryByText("Delete this draft permanently?")).not.toBeInTheDocument();
      expect(screen.getByText("Delete Draft")).toBeInTheDocument();
    });

    it("calls onBack after successful deletion", async () => {
      const user = userEvent.setup();
      const mocks: MockLink.MockedResponse[] = [
        ...makeMock(baseQuotation),
        {
          request: { query: DELETE_QUOTATION_MUTATION, variables: { id: "q-1" } },
          result: { data: { deleteQuotation: true } },
        },
      ];
      renderAs(mockRep, mocks);
      await user.click(await screen.findByText("Delete Draft"));
      await user.click(screen.getByText("Yes, delete"));
      await waitFor(() => expect(mockOnBack).toHaveBeenCalled());
    });

    it("shows error when deletion fails", async () => {
      const user = userEvent.setup();
      const mocks: MockLink.MockedResponse[] = [
        ...makeMock(baseQuotation),
        {
          request: { query: DELETE_QUOTATION_MUTATION, variables: { id: "q-1" } },
          error: new Error("Only DRAFT quotations can be deleted"),
        },
      ];
      renderAs(mockRep, mocks);
      await user.click(await screen.findByText("Delete Draft"));
      await user.click(screen.getByText("Yes, delete"));
      expect(
        await screen.findByText("Only DRAFT quotations can be deleted"),
      ).toBeInTheDocument();
    });
  });

  describe("StatusTimeline", () => {
    it("renders status history entries when present", async () => {
      const historyMock: MockLink.MockedResponse = {
        request: { query: STATUS_HISTORY_QUERY, variables: { quotationId: "q-1" } },
        result: {
          data: {
            statusHistory: [
              {
                id: "sh-1",
                fromStatus: "DRAFT",
                toStatus: "SENT",
                note: "Ready for review",
                changedAt: "2026-04-11T10:00:00.000Z",
                changedBy: { name: "Anna Schmidt" },
              },
            ],
          },
        },
      };
      const mocks: MockLink.MockedResponse[] = [
        { request: { query: QUOTATION_QUERY, variables: { id: "q-1" } }, result: { data: { quotation: baseQuotation } } },
        historyMock,
      ];
      renderAs(mockRep, mocks);
      await screen.findByText("Enterprise License");
      expect(await screen.findByText("Status History")).toBeInTheDocument();
      expect(screen.getByText("Draft")).toBeInTheDocument();
      expect(screen.getByText("Sent")).toBeInTheDocument();
      expect(screen.getByText("Ready for review")).toBeInTheDocument();
    });

    it("renders 'Created' label for DRAFT→DRAFT entry with no note", async () => {
      const historyMock: MockLink.MockedResponse = {
        request: { query: STATUS_HISTORY_QUERY, variables: { quotationId: "q-1" } },
        result: {
          data: {
            statusHistory: [
              {
                id: "sh-1",
                fromStatus: "DRAFT",
                toStatus: "DRAFT",
                note: null,
                changedAt: "2026-04-10T00:00:00.000Z",
                changedBy: { name: "Anna Schmidt" },
              },
            ],
          },
        },
      };
      const mocks: MockLink.MockedResponse[] = [
        { request: { query: QUOTATION_QUERY, variables: { id: "q-1" } }, result: { data: { quotation: baseQuotation } } },
        historyMock,
      ];
      renderAs(mockRep, mocks);
      await screen.findByText("Enterprise License");
      expect(await screen.findByText("Created")).toBeInTheDocument();
      expect(screen.queryByText("Draft")).not.toBeInTheDocument();
    });

    it("renders 'Edited' label with note for DRAFT→DRAFT entry with a note", async () => {
      const historyMock: MockLink.MockedResponse = {
        request: { query: STATUS_HISTORY_QUERY, variables: { quotationId: "q-1" } },
        result: {
          data: {
            statusHistory: [
              {
                id: "sh-1",
                fromStatus: "DRAFT",
                toStatus: "DRAFT",
                note: null,
                changedAt: "2026-04-10T00:00:00.000Z",
                changedBy: { name: "Anna Schmidt" },
              },
              {
                id: "sh-2",
                fromStatus: "DRAFT",
                toStatus: "DRAFT",
                note: "Edited: title, line items",
                changedAt: "2026-04-10T01:00:00.000Z",
                changedBy: { name: "Anna Schmidt" },
              },
            ],
          },
        },
      };
      const mocks: MockLink.MockedResponse[] = [
        { request: { query: QUOTATION_QUERY, variables: { id: "q-1" } }, result: { data: { quotation: baseQuotation } } },
        historyMock,
      ];
      renderAs(mockRep, mocks);
      await screen.findByText("Enterprise License");
      expect(await screen.findByText("Edited")).toBeInTheDocument();
      expect(screen.getByText("Edited: title, line items")).toBeInTheDocument();
    });

    it("hides the timeline when history is empty", async () => {
      renderAs(mockRep, makeMock(baseQuotation));
      await screen.findByText("Enterprise License");
      expect(screen.queryByText("Status History")).not.toBeInTheDocument();
    });
  });

  describe("ConversionScoreCard", () => {
    function makeSentMock(scoreMock: MockLink.MockedResponse): MockLink.MockedResponse[] {
      const sentQuotation = { ...baseQuotation, status: "SENT" };
      return [
        {
          request: { query: QUOTATION_QUERY, variables: { id: "q-1" } },
          result: { data: { quotation: sentQuotation } },
        },
        emptyHistoryMock,
        scoreMock,
      ];
    }

    it("renders Win Chance score for SENT quotation viewed by manager", async () => {
      const mocks = makeSentMock({
        request: { query: CONVERSION_SCORE_QUERY, variables: { quotationId: "q-1" } },
        result: { data: { conversionScore: { score: 82, label: "HIGH" } } },
      });
      renderAs(mockManager, mocks);
      expect(await screen.findByText("Win Chance")).toBeInTheDocument();
      expect(screen.getByText("82")).toBeInTheDocument();
    });

    it("renders nothing when conversion score query returns no data", async () => {
      const mocks = makeSentMock({
        request: { query: CONVERSION_SCORE_QUERY, variables: { quotationId: "q-1" } },
        error: new Error("No score"),
      });
      renderAs(mockManager, mocks);
      await screen.findByText("Enterprise License");
      expect(screen.queryByText("Win Chance")).not.toBeInTheDocument();
    });
  });

  describe("Edit modal", () => {
    it("opens edit modal when Edit Draft button is clicked", async () => {
      const user = userEvent.setup();
      renderAs(mockRep, makeMock(baseQuotation));
      await user.click(await screen.findByText("Edit Draft"));
      expect(screen.getByRole("dialog", { name: "Edit quotation" })).toBeInTheDocument();
    });

    it("closes edit modal when Cancel is clicked", async () => {
      const user = userEvent.setup();
      renderAs(mockRep, makeMock(baseQuotation));
      await user.click(await screen.findByText("Edit Draft"));
      expect(screen.getByRole("dialog", { name: "Edit quotation" })).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: /cancel/i }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });
});
