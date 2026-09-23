import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MockedProvider } from "@apollo/client/testing/react";
import type { MockLink } from "@apollo/client/testing";
import RequestPasswordResetPage from "./RequestPasswordResetPage";
import { REQUEST_PASSWORD_RESET_MUTATION } from "../graphql/mutations";

function renderPage(mocks: MockLink.MockedResponse[] = []) {
  return render(
    <MemoryRouter>
      <MockedProvider mocks={mocks}>
        <RequestPasswordResetPage />
      </MockedProvider>
    </MemoryRouter>,
  );
}

describe("RequestPasswordResetPage", () => {
  it("renders the reset request form", () => {
    renderPage();
    expect(screen.getByText("Reset your password")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("you@company.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send reset link" })).toBeInTheDocument();
  });

  it("shows success state after mutation completes", async () => {
    const mock = {
      request: {
        query: REQUEST_PASSWORD_RESET_MUTATION,
        variables: { email: "user@test.com" },
      },
      result: { data: { requestPasswordReset: true } },
    };
    renderPage([mock]);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "user@test.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    await screen.findByText("Check your email");
    expect(screen.getByText(/If that address is registered/)).toBeInTheDocument();
  });

  it("shows success state even when mutation errors (no email enumeration)", async () => {
    const mock = {
      request: {
        query: REQUEST_PASSWORD_RESET_MUTATION,
        variables: { email: "nobody@test.com" },
      },
      error: new Error("Not found"),
    };
    renderPage([mock]);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "nobody@test.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    await screen.findByText("Check your email");
  });

  it("shows loading state while mutation is in-flight", async () => {
    const mock = {
      request: {
        query: REQUEST_PASSWORD_RESET_MUTATION,
        variables: { email: "user@test.com" },
      },
      result: { data: { requestPasswordReset: true } },
      delay: 100,
    };
    renderPage([mock]);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "user@test.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(screen.getByRole("button", { name: "Sending…" })).toBeInTheDocument();
    await screen.findByText("Check your email");
  });

  it("has a back to sign in link", () => {
    renderPage();
    expect(screen.getByRole("link", { name: "Back to sign in" })).toBeInTheDocument();
  });
});
