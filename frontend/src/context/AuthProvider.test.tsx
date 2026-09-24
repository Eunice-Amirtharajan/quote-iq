import { render, screen, waitFor } from "@testing-library/react";
import { MockedProvider } from "@apollo/client/testing/react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "./AuthProvider";
import { useAuth } from "../hooks/useAuth";
import { ME_QUERY } from "../graphql/queries";

// Minimal consumer that renders the current user or a status string
function UserDisplay() {
  const { user } = useAuth();
  return <div>{user ? `user:${user.email}` : "no-user"}</div>;
}

function renderWithPath(path: string, mocks: unknown[] = []) {
  // AuthProvider reads window.location.pathname directly at render time.
  // jsdom's Location is not reassignable, so we patch just the pathname via defineProperty.
  Object.defineProperty(window, "location", {
    value: { ...window.location, pathname: path },
    configurable: true,
    writable: true,
  });

  return render(
    <MockedProvider mocks={mocks as never}>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <UserDisplay />
        </AuthProvider>
      </MemoryRouter>
    </MockedProvider>,
  );
}

const meSuccessMock = {
  request: { query: ME_QUERY },
  result: {
    data: {
      me: { id: "u-1", name: "Marcus", email: "marcus@quoteiq.com", role: "SALES_MANAGER" },
    },
  },
};

const meNetworkErrorMock = {
  request: { query: ME_QUERY },
  error: new Error("Network error"),
};

const meLoadingMock = {
  request: { query: ME_QUERY },
  // never resolves — simulates perpetual loading
  result: new Promise(() => {}),
};

describe("AuthProvider — protected paths", () => {
  it("shows spinner while ME_QUERY is loading", () => {
    renderWithPath("/dashboard", [meLoadingMock]);
    // Spinner is the animated div — no text, just the spin element
    expect(screen.queryByText("no-user")).not.toBeInTheDocument();
    expect(screen.queryByText(/could not connect/i)).not.toBeInTheDocument();
    // The spinner div is present
    expect(document.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("renders children (no-user) when ME_QUERY has a network error (errorPolicy:ignore suppresses it)", async () => {
    renderWithPath("/dashboard", [meNetworkErrorMock]);
    // errorPolicy:'ignore' silently drops the error — loading completes, data is undefined,
    // and the app renders the children with user:null rather than showing an error wall.
    await waitFor(() => {
      expect(screen.getByText("no-user")).toBeInTheDocument();
    });
  });

  it("renders children and exposes user when ME_QUERY succeeds", async () => {
    renderWithPath("/dashboard", [meSuccessMock]);
    await waitFor(() => {
      expect(screen.getByText("user:marcus@quoteiq.com")).toBeInTheDocument();
    });
  });
});

describe("AuthProvider — public paths skip ME_QUERY", () => {
  it("renders children immediately on /invite/:token without spinner", () => {
    renderWithPath("/invite/abc123");
    // Children should render right away — no spinner, no error wall
    expect(screen.getByText("no-user")).toBeInTheDocument();
    expect(document.querySelector(".animate-spin")).not.toBeInTheDocument();
  });

  it("renders children immediately on /reset-password without spinner", () => {
    renderWithPath("/reset-password");
    expect(screen.getByText("no-user")).toBeInTheDocument();
    expect(document.querySelector(".animate-spin")).not.toBeInTheDocument();
  });

  it("renders children immediately on /reset-password/:token without spinner", () => {
    renderWithPath("/reset-password/sometoken");
    expect(screen.getByText("no-user")).toBeInTheDocument();
    expect(document.querySelector(".animate-spin")).not.toBeInTheDocument();
  });

  it("renders children immediately on /login without spinner", () => {
    renderWithPath("/login");
    expect(screen.getByText("no-user")).toBeInTheDocument();
    expect(document.querySelector(".animate-spin")).not.toBeInTheDocument();
  });

  it("renders children immediately on /view-quotation/:token without spinner", () => {
    renderWithPath("/view-quotation/sometoken");
    expect(screen.getByText("no-user")).toBeInTheDocument();
    expect(document.querySelector(".animate-spin")).not.toBeInTheDocument();
  });
});
