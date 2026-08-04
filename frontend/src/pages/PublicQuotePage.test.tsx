import { render, screen } from "@testing-library/react";
import { MockedProvider } from "@apollo/client/testing/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { MockLink } from "@apollo/client/testing";
import { QUOTATION_BY_TOKEN_QUERY } from "../graphql/queries";
import PublicQuotePage from "./PublicQuotePage";

const mockQuotation = {
  quotationNumber: "QT-2026-0001",
  title: "Enterprise License",
  clientName: "Hans Bauer",
  status: "SENT",
  notes: "Annual license fee",
  taxRate: 19,
  subtotal: 6000,
  taxAmount: 1140,
  total: 7140,
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

function renderWithToken(
  token: string,
  mocks: MockLink.MockedResponse[],
) {
  return render(
    <MockedProvider mocks={mocks}>
      <MemoryRouter initialEntries={[`/view-quotation/${token}`]}>
        <Routes>
          <Route path="/view-quotation/:token" element={<PublicQuotePage />} />
        </Routes>
      </MemoryRouter>
    </MockedProvider>,
  );
}

const successMocks: MockLink.MockedResponse[] = [
  {
    request: {
      query: QUOTATION_BY_TOKEN_QUERY,
      variables: { token: "valid-token" },
    },
    result: { data: { quotationByToken: mockQuotation } },
  },
];

const notFoundMocks: MockLink.MockedResponse[] = [
  {
    request: {
      query: QUOTATION_BY_TOKEN_QUERY,
      variables: { token: "bad-token" },
    },
    result: { data: { quotationByToken: null } },
  },
];

const errorMocks: MockLink.MockedResponse[] = [
  {
    request: {
      query: QUOTATION_BY_TOKEN_QUERY,
      variables: { token: "error-token" },
    },
    error: new Error("Network error"),
  },
];

describe("PublicQuotePage", () => {
  it("shows loading state initially", () => {
    renderWithToken("valid-token", successMocks);
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("renders quotation title and client name on success", async () => {
    renderWithToken("valid-token", successMocks);
    expect(await screen.findByText("Enterprise License")).toBeInTheDocument();
    expect(screen.getByText("Prepared for Hans Bauer")).toBeInTheDocument();
  });

  it("renders quotation number and status badge", async () => {
    renderWithToken("valid-token", successMocks);
    await screen.findByText("Enterprise License");
    expect(screen.getByText("QT-2026-0001")).toBeInTheDocument();
    expect(screen.getByText("SENT")).toBeInTheDocument();
  });

  it("renders line items sorted by sortOrder", async () => {
    renderWithToken("valid-token", successMocks);
    await screen.findByText("Enterprise License");
    expect(screen.getByText("Software License")).toBeInTheDocument();
    expect(screen.getByText("Support Package")).toBeInTheDocument();
  });

  it("renders totals correctly", async () => {
    renderWithToken("valid-token", successMocks);
    await screen.findByText("Enterprise License");
    expect(screen.getByText("€6,000")).toBeInTheDocument();
    expect(screen.getByText("€1,140")).toBeInTheDocument();
    expect(screen.getByText("€7,140")).toBeInTheDocument();
  });

  it("renders notes when present", async () => {
    renderWithToken("valid-token", successMocks);
    expect(await screen.findByText("Annual license fee")).toBeInTheDocument();
  });

  it("renders footer branding", async () => {
    renderWithToken("valid-token", successMocks);
    await screen.findByText("Enterprise License");
    expect(screen.getByText("Powered by QuoteIQ")).toBeInTheDocument();
  });

  it("shows error message when token is not found", async () => {
    renderWithToken("bad-token", notFoundMocks);
    expect(
      await screen.findByText(/invalid/i),
    ).toBeInTheDocument();
  });

  it("shows error message when query fails", async () => {
    renderWithToken("error-token", errorMocks);
    expect(
      await screen.findByText(/invalid/i),
    ).toBeInTheDocument();
  });

  it("does not render notes section when notes is null", async () => {
    const noNotesMocks: MockLink.MockedResponse[] = [
      {
        request: {
          query: QUOTATION_BY_TOKEN_QUERY,
          variables: { token: "no-notes-token" },
        },
        result: {
          data: {
            quotationByToken: { ...mockQuotation, notes: null },
          },
        },
      },
    ];
    renderWithToken("no-notes-token", noNotesMocks);
    await screen.findByText("Enterprise License");
    expect(screen.queryByText("Annual license fee")).not.toBeInTheDocument();
  });
});
