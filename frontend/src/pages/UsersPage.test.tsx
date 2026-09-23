import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MockedProvider } from "@apollo/client/testing/react";
import UsersPage from "./UsersPage";
import { USERS_QUERY } from "../graphql/queries";
import { INVITE_USER_MUTATION } from "../graphql/mutations";

const USERS = [
  { id: "u-1", name: "Alice Smith", email: "alice@test.com", role: "SALES_MANAGER", createdAt: "2026-01-01T00:00:00.000Z" },
  { id: "u-2", name: "Bob Jones", email: "bob@test.com", role: "SALES_REP", createdAt: "2026-02-01T00:00:00.000Z" },
];

const usersMock = {
  request: { query: USERS_QUERY },
  result: { data: { users: USERS } },
};

function renderPage(mocks: object[] = [usersMock]) {
  return render(
    <MemoryRouter>
      <MockedProvider mocks={mocks} addTypename={false}>
        <UsersPage />
      </MockedProvider>
    </MemoryRouter>,
  );
}

describe("UsersPage", () => {
  it("shows loading state initially", () => {
    renderPage();
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("renders user list after loading", async () => {
    renderPage();
    await screen.findByText("Alice Smith");
    expect(screen.getByText("bob@test.com")).toBeInTheDocument();
    expect(screen.getByText("SALES REP")).toBeInTheDocument();
    expect(screen.getByText("SALES MANAGER")).toBeInTheDocument();
  });

  it("opens the invite modal when Invite user is clicked", async () => {
    renderPage();
    await screen.findByText("Alice Smith");
    fireEvent.click(screen.getByRole("button", { name: "Invite user" }));
    expect(screen.getByRole("heading", { name: "Invite user" })).toBeInTheDocument();
    expect(screen.getByLabelText("Full name")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Role")).toBeInTheDocument();
  });

  it("closes the modal when Cancel is clicked", async () => {
    renderPage();
    await screen.findByText("Alice Smith");
    fireEvent.click(screen.getByRole("button", { name: "Invite user" }));
    expect(screen.getByRole("heading", { name: "Invite user" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "Invite user" })).not.toBeInTheDocument(),
    );
  });

  it("closes the modal when backdrop is clicked", async () => {
    renderPage();
    await screen.findByText("Alice Smith");
    fireEvent.click(screen.getByRole("button", { name: "Invite user" }));
    // Click the backdrop (aria-hidden overlay div)
    const backdrop = document.querySelector('[aria-hidden="true"]')!;
    fireEvent.click(backdrop);
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "Invite user" })).not.toBeInTheDocument(),
    );
  });

  it("submits invite and shows success state", async () => {
    const inviteMock = {
      request: {
        query: INVITE_USER_MUTATION,
        variables: { name: "Carol Davis", email: "carol@test.com", role: "SALES_REP" },
      },
      result: { data: { inviteUser: true } },
    };
    renderPage([usersMock, inviteMock, usersMock]);

    await screen.findByText("Alice Smith");
    fireEvent.click(screen.getByRole("button", { name: "Invite user" }));

    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Carol Davis" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "carol@test.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send invite" }));

    await screen.findByText("Invite sent");
    expect(screen.getByText(/carol@test.com/)).toBeInTheDocument();
  });

  it("shows error message when invite mutation fails", async () => {
    const inviteMock = {
      request: {
        query: INVITE_USER_MUTATION,
        variables: { name: "Carol Davis", email: "carol@test.com", role: "SALES_REP" },
      },
      error: new Error("A user with that email already exists"),
    };
    renderPage([usersMock, inviteMock]);

    await screen.findByText("Alice Smith");
    fireEvent.click(screen.getByRole("button", { name: "Invite user" }));
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Carol Davis" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "carol@test.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send invite" }));

    await screen.findByText("A user with that email already exists");
  });

  it("closes invite success modal when Done is clicked", async () => {
    const inviteMock = {
      request: {
        query: INVITE_USER_MUTATION,
        variables: { name: "Carol Davis", email: "carol@test.com", role: "SALES_REP" },
      },
      result: { data: { inviteUser: true } },
    };
    renderPage([usersMock, inviteMock, usersMock]);

    await screen.findByText("Alice Smith");
    fireEvent.click(screen.getByRole("button", { name: "Invite user" }));
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Carol Davis" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "carol@test.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send invite" }));

    await screen.findByText("Invite sent");
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() =>
      expect(screen.queryByText("Invite sent")).not.toBeInTheDocument(),
    );
  });

  it("resets form state when modal is reopened", async () => {
    renderPage();
    await screen.findByText("Alice Smith");

    fireEvent.click(screen.getByRole("button", { name: "Invite user" }));
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Typed Name" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "Invite user" })).not.toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Invite user" }));
    expect(screen.getByLabelText("Full name")).toHaveValue("");
  });
});
