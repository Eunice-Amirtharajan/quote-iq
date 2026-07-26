import { render, screen, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MockedProvider } from "@apollo/client/testing/react";
import { vi } from "vitest";
import { useState, type ReactNode } from "react";
import { AuthContext, type User } from "./context/auth-context";
import { LOGOUT_MUTATION } from "./graphql/mutations";
import type { MockLink } from "@apollo/client/testing";

vi.mock("./pages/DashboardPage", () => ({ default: () => <div>DashboardPage</div> }));
vi.mock("./pages/QuotationsPage", () => ({ default: ({ onSelect }: { onSelect: (id: string) => void }) => <button onClick={() => onSelect("q-1")}>QuotationsPage</button> }));
vi.mock("./pages/QuotationDetailPage", () => ({ default: () => <div>QuotationDetailPage</div> }));
vi.mock("./pages/WinLossPage", () => ({ default: () => <div>WinLossPage</div> }));
vi.mock("./pages/LoginPage", () => ({ default: () => <div>LoginPage</div> }));
vi.mock("./lib/apollo", () => ({
  client: { resetStore: vi.fn().mockResolvedValue(null) },
}));

// BrowserRouter is replaced with MemoryRouter so tests control the initial path.
// AuthProvider is replaced with a controlled AuthContext so tests control user state.
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, BrowserRouter: ({ children }: { children: ReactNode }) => <>{children}</> };
});
vi.mock("./context/AuthProvider", () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

import App from "./App";

const mockManager: User = {
  id: "u-1",
  name: "Marcus Klein",
  email: "marcus@quoteiq.com",
  role: "SALES_MANAGER",
};

const mockRep: User = {
  id: "u-2",
  name: "Anna Schmidt",
  email: "anna@quoteiq.com",
  role: "SALES_REP",
};

const logoutMock: MockLink.MockedResponse = {
  request: { query: LOGOUT_MUTATION },
  result: { data: { logout: true } },
};

function TestApp({
  initialUser,
  initialPath = "/",
  onSetUser,
}: {
  initialUser: User | null;
  initialPath?: string;
  onSetUser?: (fn: (u: User | null) => void) => void;
}) {
  const [user, setUser] = useState<User | null>(initialUser);

  if (onSetUser) onSetUser(setUser);

  return (
    <AuthContext.Provider value={{ user, setUser }}>
      <MockedProvider mocks={[logoutMock]}>
        <MemoryRouter initialEntries={[initialPath]}>
          <App />
        </MemoryRouter>
      </MockedProvider>
    </AuthContext.Provider>
  );
}

describe("AppRoutes — initial redirect", () => {
  it("redirects manager from / to /dashboard", () => {
    render(<TestApp initialUser={mockManager} initialPath="/" />);
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });

  it("redirects sales rep from / to /quotations", () => {
    render(<TestApp initialUser={mockRep} initialPath="/" />);
    expect(screen.getByText("Quotations")).toBeInTheDocument();
  });

  it("shows LoginPage when not authenticated", () => {
    render(<TestApp initialUser={null} initialPath="/" />);
    expect(screen.getByText("LoginPage")).toBeInTheDocument();
  });
});

describe("AppRoutes — direct route access", () => {
  it("manager can access /dashboard directly", () => {
    render(<TestApp initialUser={mockManager} initialPath="/dashboard" />);
    expect(screen.getByText("DashboardPage")).toBeInTheDocument();
  });

  it("sales rep can access /quotations directly", () => {
    render(<TestApp initialUser={mockRep} initialPath="/quotations" />);
    expect(screen.getByText("QuotationsPage")).toBeInTheDocument();
  });

  it("unknown path redirects to role home", () => {
    render(<TestApp initialUser={mockRep} initialPath="/does-not-exist" />);
    expect(screen.getByText("QuotationsPage")).toBeInTheDocument();
  });
});

describe("AppRoutes — role switch after logout (the bug scenario)", () => {
  it("manager on /dashboard logs out, sales rep logs in: lands on /quotations", async () => {
    let externalSetUser: (u: User | null) => void = () => {};

    render(
      <TestApp
        initialUser={mockManager}
        initialPath="/dashboard"
        onSetUser={(fn) => { externalSetUser = fn; }}
      />,
    );

    expect(screen.getByText("Dashboard")).toBeInTheDocument();

    // Simulate logout — URL stays on /dashboard
    act(() => { externalSetUser(null); });
    expect(screen.getByText("LoginPage")).toBeInTheDocument();

    // Sales rep logs in
    act(() => { externalSetUser(mockRep); });

    expect(screen.getByText("Quotations")).toBeInTheDocument();
    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
  });

  it("sales rep on /quotations logs out, manager logs in: lands on /dashboard", async () => {
    let externalSetUser: (u: User | null) => void = () => {};

    render(
      <TestApp
        initialUser={mockRep}
        initialPath="/quotations"
        onSetUser={(fn) => { externalSetUser = fn; }}
      />,
    );

    expect(screen.getByText("Quotations")).toBeInTheDocument();

    // Simulate logout — URL stays on /quotations
    act(() => { externalSetUser(null); });
    expect(screen.getByText("LoginPage")).toBeInTheDocument();

    // Manager logs in
    act(() => { externalSetUser(mockManager); });

    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });
});
