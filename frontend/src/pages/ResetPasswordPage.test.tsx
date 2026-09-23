import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { MockedProvider } from "@apollo/client/testing/react";
import { vi } from "vitest";
import type { MockLink } from "@apollo/client/testing";
import ResetPasswordPage from "./ResetPasswordPage";
import { RESET_PASSWORD_MUTATION } from "../graphql/mutations";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

function renderPage(mocks: MockLink.MockedResponse[] = []) {
  return render(
    <MemoryRouter initialEntries={["/reset-password/test-token"]}>
      <Routes>
        <Route
          path="/reset-password/:token"
          element={
            <MockedProvider mocks={mocks}>
              <ResetPasswordPage />
            </MockedProvider>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ResetPasswordPage", () => {
  afterEach(() => vi.clearAllMocks());

  it("renders the new password form", () => {
    renderPage();
    expect(screen.getByText("Choose a new password")).toBeInTheDocument();
    expect(screen.getByLabelText("New password")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirm password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Update password" })).toBeInTheDocument();
  });

  it("shows error when password is shorter than 8 characters", () => {
    renderPage();
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "short" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "short" } });
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));
    expect(screen.getByText("Password must be at least 8 characters.")).toBeInTheDocument();
  });

  it("shows error when passwords do not match", () => {
    renderPage();
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "password1" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "password2" } });
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));
    expect(screen.getByText("Passwords do not match.")).toBeInTheDocument();
  });

  it("calls mutation and shows success state on completion", async () => {
    const mock = {
      request: {
        query: RESET_PASSWORD_MUTATION,
        variables: { token: "test-token", password: "newpassword" },
      },
      result: { data: { resetPassword: true } },
    };
    renderPage([mock]);
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "newpassword" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "newpassword" } });
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));

    await screen.findByText("Password updated");
    expect(screen.getByText("Go to sign in")).toBeInTheDocument();
  });

  it("navigates to /login when Go to sign in is clicked", async () => {
    const mock = {
      request: {
        query: RESET_PASSWORD_MUTATION,
        variables: { token: "test-token", password: "newpassword" },
      },
      result: { data: { resetPassword: true } },
    };
    renderPage([mock]);
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "newpassword" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "newpassword" } });
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));

    await screen.findByText("Go to sign in");
    fireEvent.click(screen.getByRole("button", { name: "Go to sign in" }));
    expect(mockNavigate).toHaveBeenCalledWith("/login");
  });

  it("shows mutation error message when resetPassword fails", async () => {
    const mock = {
      request: {
        query: RESET_PASSWORD_MUTATION,
        variables: { token: "test-token", password: "newpassword" },
      },
      result: { errors: [{ message: "Invalid or expired reset link" }] },
    };
    renderPage([mock]);
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "newpassword" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "newpassword" } });
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));

    await screen.findByText("Invalid or expired reset link");
  });

  it("shows loading state while mutation is in-flight", async () => {
    const mock = {
      request: {
        query: RESET_PASSWORD_MUTATION,
        variables: { token: "test-token", password: "newpassword" },
      },
      result: { data: { resetPassword: true } },
      delay: 100,
    };
    renderPage([mock]);
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "newpassword" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "newpassword" } });
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));

    expect(screen.getByRole("button", { name: "Updating…" })).toBeInTheDocument();
    await screen.findByText("Password updated");
  });
});
