import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing/react";
import { vi } from "vitest";
import QuotationDetailPage from "./QuotationDetailPage";
import { QUOTATION_QUERY } from "../graphql/queries";
import { UPDATE_QUOTATION_STATUS_MUTATION } from "../graphql/mutations";
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
  status: "DRAFT",
  notes: "Annual license fee",
  taxRate: 19,
  subtotal: 6000,
  taxAmount: 1140,
  total: 7140,
  validUntil: null,
  createdAt: "2026-04-10T00:00:00.000Z",
  client: {
    name: "Hans Bauer",
    company: "Bauer GmbH",
    email: "hans@bauer.de",
    city: "Berlin",
    country: "Germany",
  },
  createdBy: {
    id: "u-rep",
    name: "Anna Schmidt",
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

const makeMock = (
  quotation: typeof baseQuotation,
): MockLink.MockedResponse[] => [
  {
    request: { query: QUOTATION_QUERY, variables: { id: "q-1" } },
    result: { data: { quotation } },
  },
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
      <MockedProvider mocks={mocks} addTypename={false}>
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
    expect(screen.getByText("Bauer GmbH")).toBeInTheDocument();
    expect(screen.getByText("hans@bauer.de")).toBeInTheDocument();
    expect(screen.getByText("Berlin, Germany")).toBeInTheDocument();
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

  it("renders validUntil when present", async () => {
    const withValidUntil = {
      ...baseQuotation,
      validUntil: "2026-12-31T00:00:00.000Z",
    };
    renderAs(mockManager, makeMock(withValidUntil));
    await screen.findByText("Enterprise License");
    expect(screen.getByText("Valid Until")).toBeInTheDocument();
  });

  it("does not render validUntil section when null", async () => {
    renderAs(mockManager, makeMock(baseQuotation));
    await screen.findByText("Enterprise License");
    expect(screen.queryByText("Valid Until")).not.toBeInTheDocument();
  });

  it("does not render location when city and country are null", async () => {
    const noLocation = {
      ...baseQuotation,
      client: { ...baseQuotation.client, city: null, country: null },
    };
    renderAs(mockManager, makeMock(noLocation));
    await screen.findByText("Enterprise License");
    expect(screen.queryByText("Location")).not.toBeInTheDocument();
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
  });
});
