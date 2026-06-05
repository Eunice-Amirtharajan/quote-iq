import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { MockedProvider } from "@apollo/client/testing/react";
import LoginPage from "./LoginPage";
import { LOGIN_MUTATION } from "../graphql/mutations";
import { AuthContext } from "../context/auth-context";
import type { MockLink } from "@apollo/client/testing";

const mockSetUser = vi.fn();

const renderLoginPage = (mocks: MockLink.MockedResponse[] = []) => {
  return render(
    <MockedProvider mocks={mocks}>
      <AuthContext.Provider value={{ user: null, setUser: mockSetUser }}>
        <LoginPage />
      </AuthContext.Provider>
    </MockedProvider>,
  );
};

describe("LoginPage", () => {
  afterEach(() => vi.clearAllMocks());

  it("renders login form", () => {
    renderLoginPage();
    expect(screen.getByPlaceholderText("you@company.com")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("••••••••")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("shows loading state while submitting", async () => {
    const mocks: MockLink.MockedResponse[] = [
      {
        request: {
          query: LOGIN_MUTATION,
          variables: { email: "marcus@quoteiq.com", password: "password123" },
        },
        result: {
          data: {
            login: {
              id: "u-1",
              name: "Marcus",
              email: "marcus@quoteiq.com",
              role: "SALES_MANAGER",
            },
          },
        },
        delay: 100,
      },
    ];

    renderLoginPage(mocks);

    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "marcus@quoteiq.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("••••••••"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(
      screen.getByRole("button", { name: "Signing in..." }),
    ).toBeInTheDocument();
  });

  it("calls setUser on successful login", async () => {
    const mockUser = {
      id: "u-1",
      name: "Marcus",
      email: "marcus@quoteiq.com",
      role: "SALES_MANAGER",
    };

    const mocks: MockLink.MockedResponse[] = [
      {
        request: {
          query: LOGIN_MUTATION,
          variables: { email: "marcus@quoteiq.com", password: "password123" },
        },
        result: { data: { login: mockUser } },
      },
    ];

    renderLoginPage(mocks);

    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "marcus@quoteiq.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("••••••••"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(mockSetUser).toHaveBeenCalledWith(mockUser);
    });
  });

  it("shows error message when login fails", async () => {
    renderLoginPage([]);

    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "wrong@test.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("••••••••"), {
      target: { value: "wrongpass" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(document.querySelector(".text-red-600")).toBeInTheDocument();
    });
  });

  it("shows demo credentials when VITE_SHOW_DEMO_CREDENTIALS is true", () => {
    vi.stubEnv("VITE_SHOW_DEMO_CREDENTIALS", "true");
    renderLoginPage();
    expect(screen.getByText("Demo credentials")).toBeInTheDocument();
    expect(screen.getByText(/marcus@quoteiq.com/)).toBeInTheDocument();
    expect(screen.getByText(/password123/)).toBeInTheDocument();
    vi.unstubAllEnvs();
  });

  it("hides demo credentials when VITE_SHOW_DEMO_CREDENTIALS is not set", () => {
    vi.stubEnv("VITE_SHOW_DEMO_CREDENTIALS", "");
    renderLoginPage();
    expect(screen.queryByText("Demo credentials")).not.toBeInTheDocument();
    vi.unstubAllEnvs();
  });
});
