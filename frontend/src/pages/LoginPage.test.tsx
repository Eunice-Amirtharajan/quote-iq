import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import { MockedProvider } from "@apollo/client/testing/react";
import LoginPage from "./LoginPage";
import { LOGIN_MUTATION } from "../graphql/mutations";
import { AuthContext } from "../context/auth-context";
import type { MockLink } from "@apollo/client/testing";
import { client } from "../lib/apollo";

vi.mock("../lib/apollo", () => ({
  client: { resetStore: vi.fn().mockResolvedValue(null) },
}));

const mockSetUser = vi.fn();

const renderLoginPage = (mocks: MockLink.MockedResponse[] = []) => {
  return render(
    <MemoryRouter>
      <MockedProvider mocks={mocks}>
        <AuthContext.Provider value={{ user: null, setUser: mockSetUser }}>
          <LoginPage />
        </AuthContext.Provider>
      </MockedProvider>
    </MemoryRouter>,
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

  it("shows demo login buttons when VITE_SHOW_DEMO_CREDENTIALS is true", () => {
    vi.stubEnv("VITE_SHOW_DEMO_CREDENTIALS", "true");
    renderLoginPage();
    expect(screen.getByRole("button", { name: "Try as Manager" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try as Sales Rep" })).toBeInTheDocument();
    vi.unstubAllEnvs();
  });

  it("hides demo buttons when VITE_SHOW_DEMO_CREDENTIALS is not set", () => {
    vi.stubEnv("VITE_SHOW_DEMO_CREDENTIALS", "");
    renderLoginPage();
    expect(screen.queryByRole("button", { name: "Try as Manager" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try as Sales Rep" })).not.toBeInTheDocument();
    vi.unstubAllEnvs();
  });

  it("auto-submits login when Try as Manager is clicked", async () => {
    vi.stubEnv("VITE_SHOW_DEMO_CREDENTIALS", "true");
    const mockUser = { id: "u-1", name: "Marcus", email: "marcus@quoteiq.com", role: "SALES_MANAGER" };
    const mocks: MockLink.MockedResponse[] = [
      {
        request: { query: LOGIN_MUTATION, variables: { email: "marcus@quoteiq.com", password: "password123" } },
        result: { data: { login: mockUser } },
      },
    ];
    renderLoginPage(mocks);
    fireEvent.click(screen.getByRole("button", { name: "Try as Manager" }));
    await waitFor(() => expect(mockSetUser).toHaveBeenCalledWith(mockUser));
    vi.unstubAllEnvs();
  });

  it("auto-submits login when Try as Sales Rep is clicked", async () => {
    vi.stubEnv("VITE_SHOW_DEMO_CREDENTIALS", "true");
    const mockUser = { id: "u-2", name: "Anna", email: "anna@quoteiq.com", role: "SALES_REP" };
    const mocks: MockLink.MockedResponse[] = [
      {
        request: { query: LOGIN_MUTATION, variables: { email: "anna@quoteiq.com", password: "password123" } },
        result: { data: { login: mockUser } },
      },
    ];
    renderLoginPage(mocks);
    fireEvent.click(screen.getByRole("button", { name: "Try as Sales Rep" }));
    await waitFor(() => expect(mockSetUser).toHaveBeenCalledWith(mockUser));
    vi.unstubAllEnvs();
  });

  it("shows 'Invalid email or password' for invalid credentials error", async () => {
    const mocks: MockLink.MockedResponse[] = [
      {
        request: {
          query: LOGIN_MUTATION,
          variables: { email: "wrong@test.com", password: "wrong" },
        },
        error: new Error("Invalid credentials"),
      },
    ];

    renderLoginPage(mocks);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "wrong@test.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("••••••••"), {
      target: { value: "wrong" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(
      await screen.findByText("Invalid email or password."),
    ).toBeInTheDocument();
  });

  it("shows generic error message for non-credentials errors", async () => {
    const mocks: MockLink.MockedResponse[] = [
      {
        request: {
          query: LOGIN_MUTATION,
          variables: { email: "marcus@quoteiq.com", password: "password123" },
        },
        error: new Error("Network connection failed"),
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
      await screen.findByText("Unable to sign in. Please try again later."),
    ).toBeInTheDocument();
  });

  it("calls client.resetStore() before setUser on successful login", async () => {
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

    await waitFor(() => expect(mockSetUser).toHaveBeenCalledWith(mockUser));
    // resetStore must resolve before setUser is called
    const resetOrder = (client.resetStore as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
    const setUserOrder = mockSetUser.mock.invocationCallOrder[0];
    expect(resetOrder).toBeLessThan(setUserOrder);
  });
});
