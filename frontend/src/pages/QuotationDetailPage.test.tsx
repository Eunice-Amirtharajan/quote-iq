import { render, screen } from "@testing-library/react";
import { MockedProvider } from "@apollo/client/testing/react";
import { vi } from "vitest";
import QuotationDetailPage from "./QuotationDetailPage";
import { QUOTATION_QUERY } from "../graphql/queries";
import type { MockLink } from "@apollo/client/testing";

const mockQuotation = {
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
    name: "Anna Schmidt",
    email: "anna@quoteiq.com",
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

const mockOnBack = vi.fn();

const successMock: MockLink.MockedResponse[] = [
  {
    request: {
      query: QUOTATION_QUERY,
      variables: { id: "q-1" },
    },
    result: { data: { quotation: mockQuotation } },
  },
];

const errorMock: MockLink.MockedResponse[] = [
  {
    request: {
      query: QUOTATION_QUERY,
      variables: { id: "q-1" },
    },
    error: new Error("Failed to fetch"),
  },
];

describe("QuotationDetailPage", () => {
  afterEach(() => vi.clearAllMocks());

  it("shows loading state initially", () => {
    render(
      <MockedProvider mocks={successMock}>
        <QuotationDetailPage id="q-1" onBack={mockOnBack} />
      </MockedProvider>,
    );
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("renders quotation title and status", async () => {
    render(
      <MockedProvider mocks={successMock}>
        <QuotationDetailPage id="q-1" onBack={mockOnBack} />
      </MockedProvider>,
    );

    expect(await screen.findByText("Enterprise License")).toBeInTheDocument();
    expect(screen.getByText("DRAFT")).toBeInTheDocument();
  });

  it("renders line items", async () => {
    render(
      <MockedProvider mocks={successMock}>
        <QuotationDetailPage id="q-1" onBack={mockOnBack} />
      </MockedProvider>,
    );

    await screen.findByText("Enterprise License");
    expect(screen.getByText("Software License")).toBeInTheDocument();
    expect(screen.getByText("Support Package")).toBeInTheDocument();
  });

  it("renders totals correctly", async () => {
    render(
      <MockedProvider mocks={successMock}>
        <QuotationDetailPage id="q-1" onBack={mockOnBack} />
      </MockedProvider>,
    );

    await screen.findByText("Enterprise License");
    expect(screen.getByText("€6,000")).toBeInTheDocument();
    expect(screen.getByText("€1,140")).toBeInTheDocument();
    expect(screen.getByText("€7,140")).toBeInTheDocument();
  });

  it("renders client information", async () => {
    render(
      <MockedProvider mocks={successMock}>
        <QuotationDetailPage id="q-1" onBack={mockOnBack} />
      </MockedProvider>,
    );

    await screen.findByText("Enterprise License");
    expect(screen.getByText("Hans Bauer")).toBeInTheDocument();
    expect(screen.getByText("Bauer GmbH")).toBeInTheDocument();
    expect(screen.getByText("hans@bauer.de")).toBeInTheDocument();
    expect(screen.getByText("Berlin, Germany")).toBeInTheDocument();
  });

  it("renders quotation number and created by", async () => {
    render(
      <MockedProvider mocks={successMock}>
        <QuotationDetailPage id="q-1" onBack={mockOnBack} />
      </MockedProvider>,
    );

    await screen.findByText("Enterprise License");
    expect(screen.getByText("QT-2026-0001")).toBeInTheDocument();
    expect(screen.getByText("Anna Schmidt")).toBeInTheDocument();
  });

  it("renders notes when present", async () => {
    render(
      <MockedProvider mocks={successMock}>
        <QuotationDetailPage id="q-1" onBack={mockOnBack} />
      </MockedProvider>,
    );

    expect(await screen.findByText("Annual license fee")).toBeInTheDocument();
  });

  it("calls onBack when back button clicked", async () => {
    render(
      <MockedProvider mocks={successMock}>
        <QuotationDetailPage id="q-1" onBack={mockOnBack} />
      </MockedProvider>,
    );

    await screen.findByText("Enterprise License");
    screen.getByText("← Back").click();
    expect(mockOnBack).toHaveBeenCalled();
  });

  it("shows error state when query fails", async () => {
    render(
      <MockedProvider mocks={errorMock}>
        <QuotationDetailPage id="q-1" onBack={mockOnBack} />
      </MockedProvider>,
    );

    expect(
      await screen.findByText("Failed to load quotation"),
    ).toBeInTheDocument();
  });
});
