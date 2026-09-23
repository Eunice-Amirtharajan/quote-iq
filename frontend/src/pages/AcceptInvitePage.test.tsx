import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { MockedProvider } from "@apollo/client/testing/react";
import { vi } from "vitest";
import AcceptInvitePage from "./AcceptInvitePage";
import { ACCEPT_INVITE_MUTATION } from "../graphql/mutations";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

function renderPage(mocks: object[] = []) {
  return render(
    <MemoryRouter initialEntries={["/invite/test-token"]}>
      <Routes>
        <Route
          path="/invite/:token"
          element={
            <MockedProvider mocks={mocks} addTypename={false}>
              <AcceptInvitePage />
            </MockedProvider>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("AcceptInvitePage", () => {
  afterEach(() => vi.clearAllMocks());

  it("renders the set password form", () => {
    renderPage();
    expect(screen.getByText("Set your password")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirm password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set password" })).toBeInTheDocument();
  });

  it("shows error when password is shorter than 8 characters", () => {
    renderPage();
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "short" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "short" } });
    fireEvent.click(screen.getByRole("button", { name: "Set password" }));
    expect(screen.getByText("Password must be at least 8 characters.")).toBeInTheDocument();
  });

  it("shows error when passwords do not match", () => {
    renderPage();
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password1" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "password2" } });
    fireEvent.click(screen.getByRole("button", { name: "Set password" }));
    expect(screen.getByText("Passwords do not match.")).toBeInTheDocument();
  });

  it("calls mutation and shows success state on completion", async () => {
    const mock = {
      request: {
        query: ACCEPT_INVITE_MUTATION,
        variables: { token: "test-token", password: "securepass" },
      },
      result: { data: { acceptInvite: true } },
    };
    renderPage([mock]);
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "securepass" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "securepass" } });
    fireEvent.click(screen.getByRole("button", { name: "Set password" }));

    await screen.findByText("Password set");
    expect(screen.getByText("Go to sign in")).toBeInTheDocument();
  });

  it("navigates to /login when Go to sign in is clicked", async () => {
    const mock = {
      request: {
        query: ACCEPT_INVITE_MUTATION,
        variables: { token: "test-token", password: "securepass" },
      },
      result: { data: { acceptInvite: true } },
    };
    renderPage([mock]);
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "securepass" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "securepass" } });
    fireEvent.click(screen.getByRole("button", { name: "Set password" }));

    await screen.findByText("Go to sign in");
    fireEvent.click(screen.getByRole("button", { name: "Go to sign in" }));
    expect(mockNavigate).toHaveBeenCalledWith("/login");
  });

  it("shows mutation error message when acceptInvite fails", async () => {
    const mock = {
      request: {
        query: ACCEPT_INVITE_MUTATION,
        variables: { token: "test-token", password: "securepass" },
      },
      error: new Error("Invalid or expired invite link"),
    };
    renderPage([mock]);
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "securepass" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "securepass" } });
    fireEvent.click(screen.getByRole("button", { name: "Set password" }));

    await screen.findByText("Invalid or expired invite link");
  });

  it("shows loading state while mutation is in-flight", async () => {
    const mock = {
      request: {
        query: ACCEPT_INVITE_MUTATION,
        variables: { token: "test-token", password: "securepass" },
      },
      result: { data: { acceptInvite: true } },
      delay: 100,
    };
    renderPage([mock]);
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "securepass" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "securepass" } });
    fireEvent.click(screen.getByRole("button", { name: "Set password" }));

    expect(screen.getByRole("button", { name: "Setting password…" })).toBeInTheDocument();
    await screen.findByText("Password set");
  });
});
