import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { MockedProvider } from "@apollo/client/testing/react";
import { MemoryRouter } from "react-router-dom";
import Layout from "./Layout";
import type { MemoryRouterProps } from "react-router-dom";
import { LOGOUT_MUTATION } from "../graphql/mutations";
import { AuthContext } from "../context/auth-context";
import { client } from "../lib/apollo";
import type { MockLink } from "@apollo/client/testing";

vi.mock("../lib/apollo", () => ({
  client: { resetStore: vi.fn().mockResolvedValue(null) },
}));

const mockSetUser = vi.fn();

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

function renderLayout(
  user: typeof mockManager | typeof mockRep,
  mocks: MockLink.MockedResponse[] = [],
  routerProps: MemoryRouterProps = {},
) {
  return render(
    <AuthContext.Provider value={{ user, setUser: mockSetUser }}>
      <MockedProvider mocks={mocks}>
        <MemoryRouter {...routerProps}>
          <Layout>
            <div>Page content</div>
          </Layout>
        </MemoryRouter>
      </MockedProvider>
    </AuthContext.Provider>,
  );
}

describe("Layout", () => {
  afterEach(() => vi.clearAllMocks());

  it("renders the QuoteIQ brand name", () => {
    renderLayout(mockManager);
    expect(screen.getByText("QuoteIQ")).toBeInTheDocument();
  });

  it("renders user name and role", () => {
    renderLayout(mockManager);
    expect(screen.getByText("Marcus Klein")).toBeInTheDocument();
    expect(screen.getByText("SALES MANAGER")).toBeInTheDocument();
  });

  it("shows Dashboard and Win/Loss nav for manager", () => {
    renderLayout(mockManager);
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Win/Loss")).toBeInTheDocument();
    expect(screen.getByText("Quotations")).toBeInTheDocument();
  });

  it("shows only Quotations nav for sales rep", () => {
    renderLayout(mockRep);
    expect(screen.getByText("Quotations")).toBeInTheDocument();
    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
    expect(screen.queryByText("Win/Loss")).not.toBeInTheDocument();
  });

  it("renders children", () => {
    renderLayout(mockManager);
    expect(screen.getByText("Page content")).toBeInTheDocument();
  });

  it("renders no nav items when user is null", () => {
    render(
      <AuthContext.Provider value={{ user: null, setUser: mockSetUser }}>
        <MockedProvider mocks={[]}>
          <MemoryRouter>
            <Layout><div /></Layout>
          </MemoryRouter>
        </MockedProvider>
      </AuthContext.Provider>,
    );
    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
    expect(screen.queryByText("Quotations")).not.toBeInTheDocument();
  });

  it("applies active styles to the current nav link", () => {
    renderLayout(mockManager, [], { initialEntries: ["/dashboard"] });
    const dashboardLink = screen.getByText("Dashboard").closest("a");
    expect(dashboardLink?.className).toContain("bg-gray-900");
    expect(dashboardLink?.className).toContain("text-white");
  });

  it("applies inactive styles to non-current nav links", () => {
    renderLayout(mockManager, [], { initialEntries: ["/dashboard"] });
    const quotationsLink = screen.getByText("Quotations").closest("a");
    expect(quotationsLink?.className).toContain("text-gray-600");
    expect(quotationsLink?.className).not.toContain("bg-gray-900");
  });

  it("calls client.resetStore() then setUser(null) on logout", async () => {
    const user = userEvent.setup();
    const mocks: MockLink.MockedResponse[] = [
      {
        request: { query: LOGOUT_MUTATION },
        result: { data: { logout: true } },
      },
    ];

    renderLayout(mockManager, mocks);
    await user.click(screen.getByText("Sign out"));

    await waitFor(() => expect(mockSetUser).toHaveBeenCalledWith(null));

    // resetStore must be called before setUser(null)
    const resetOrder = (client.resetStore as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
    const setUserOrder = mockSetUser.mock.invocationCallOrder[0];
    expect(resetOrder).toBeLessThan(setUserOrder);
  });
});
