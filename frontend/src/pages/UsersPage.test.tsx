import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MockedProvider } from "@apollo/client/testing/react";
import type { MockLink } from "@apollo/client/testing";
import { vi } from "vitest";
import { AuthContext } from "../context/auth-context";
import UsersPage from "./UsersPage";
import { USERS_QUERY } from "../graphql/queries";
import { INVITE_USER_MUTATION, DEACTIVATE_USER_MUTATION } from "../graphql/mutations";

const CURRENT_USER = { id: "u-me", name: "Marcus", email: "marcus@test.com", role: "SALES_MANAGER" as const };

const USERS = [
  { id: "u-1", name: "Alice Smith", email: "alice@test.com", role: "SALES_MANAGER", isActive: true, createdAt: "2026-01-01T00:00:00.000Z" },
  { id: "u-2", name: "Bob Jones", email: "bob@test.com", role: "SALES_REP", isActive: true, createdAt: "2026-02-01T00:00:00.000Z" },
];

const usersMock = (skip = 0, take = 20): MockLink.MockedResponse => ({
  request: { query: USERS_QUERY, variables: { skip, take, search: undefined } },
  result: { data: { users: { items: USERS, total: 2 } } },
});

function renderPage(mocks: MockLink.MockedResponse[] = [usersMock()]) {
  return render(
    <MemoryRouter>
      <MockedProvider mocks={mocks}>
        <AuthContext.Provider value={{ user: CURRENT_USER, setUser: vi.fn() }}>
          <UsersPage />
        </AuthContext.Provider>
      </MockedProvider>
    </MemoryRouter>,
  );
}

describe("UsersPage", () => {
  afterEach(() => vi.clearAllMocks());

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

  it("hides deactivate button for the current user's own row", async () => {
    const selfMock: MockLink.MockedResponse = {
      request: { query: USERS_QUERY, variables: { skip: 0, take: 20, search: undefined } },
      result: {
        data: {
          users: {
            items: [
              { ...CURRENT_USER, isActive: true, createdAt: "2026-01-01T00:00:00.000Z" },
              USERS[1],
            ],
            total: 2,
          },
        },
      },
    };
    renderPage([selfMock]);
    await screen.findByText("Marcus");
    const deactivateButtons = screen.getAllByRole("button", { name: "Deactivate" });
    // Only Bob's row should have a Deactivate button — Marcus is the current user
    expect(deactivateButtons).toHaveLength(1);
  });

  it("opens deactivate confirmation when Deactivate is clicked", async () => {
    renderPage();
    await screen.findByText("Alice Smith");
    fireEvent.click(screen.getAllByRole("button", { name: "Deactivate" })[0]);
    expect(screen.getByText("Deactivate user?")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Deactivate user?" })).toBeInTheDocument();
  });

  it("closes deactivate dialog when Cancel is clicked", async () => {
    renderPage();
    await screen.findByText("Alice Smith");
    fireEvent.click(screen.getAllByRole("button", { name: "Deactivate" })[0]);
    await screen.findByText("Deactivate user?");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.queryByText("Deactivate user?")).not.toBeInTheDocument(),
    );
  });

  it("calls deactivateUser mutation and closes dialog on success", async () => {
    const deactivateMock: MockLink.MockedResponse = {
      request: { query: DEACTIVATE_USER_MUTATION, variables: { id: "u-1" } },
      result: { data: { deactivateUser: true } },
    };
    renderPage([usersMock(), deactivateMock, usersMock()]);
    await screen.findByText("Alice Smith");
    fireEvent.click(screen.getAllByRole("button", { name: "Deactivate" })[0]);
    const dialog = await screen.findByText("Deactivate user?");
    // Confirm button is the last "Deactivate" button in the DOM (the dialog's confirm)
    const confirmBtn = screen.getAllByRole("button", { name: "Deactivate" }).at(-1)!;
    fireEvent.click(confirmBtn);
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
  });

  it("shows error message when deactivate mutation fails", async () => {
    const deactivateMock: MockLink.MockedResponse = {
      request: { query: DEACTIVATE_USER_MUTATION, variables: { id: "u-1" } },
      result: { errors: [{ message: "Cannot deactivate the last manager" }] },
    };
    renderPage([usersMock(), deactivateMock]);
    await screen.findByText("Alice Smith");
    fireEvent.click(screen.getAllByRole("button", { name: "Deactivate" })[0]);
    await screen.findByText("Deactivate user?");
    const confirmBtn = screen.getAllByRole("button", { name: "Deactivate" }).at(-1)!;
    fireEvent.click(confirmBtn);
    await screen.findByText("Cannot deactivate the last manager");
  });

  it("does not show pagination when total fits on one page", async () => {
    renderPage();
    await screen.findByText("Alice Smith");
    expect(screen.queryByRole("button", { name: "Previous" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
  });

  it("shows pagination when total exceeds page size", async () => {
    const bigMock: MockLink.MockedResponse = {
      request: { query: USERS_QUERY, variables: { skip: 0, take: 20, search: undefined } },
      result: { data: { users: { items: USERS, total: 45 } } },
    };
    renderPage([bigMock]);
    await screen.findByText("Alice Smith");
    expect(screen.getByRole("button", { name: "Previous" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeInTheDocument();
    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next" })).not.toBeDisabled();
  });

  it("opens the invite modal when Invite user is clicked", async () => {
    renderPage();
    await screen.findByText("Alice Smith");
    fireEvent.click(screen.getByRole("button", { name: "Invite user" }));
    expect(screen.getByRole("heading", { name: "Invite user" })).toBeInTheDocument();
  });

  it("closes invite modal when Cancel is clicked", async () => {
    renderPage();
    await screen.findByText("Alice Smith");
    fireEvent.click(screen.getByRole("button", { name: "Invite user" }));
    await screen.findByRole("heading", { name: "Invite user" });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "Invite user" })).not.toBeInTheDocument(),
    );
  });

  it("closes invite modal when backdrop is clicked", async () => {
    renderPage();
    await screen.findByText("Alice Smith");
    fireEvent.click(screen.getByRole("button", { name: "Invite user" }));
    await screen.findByRole("heading", { name: "Invite user" });
    fireEvent.click(document.querySelector('[aria-hidden="true"]')!);
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "Invite user" })).not.toBeInTheDocument(),
    );
  });

  it("navigates to next page when Next is clicked", async () => {
    const page0Mock: MockLink.MockedResponse = {
      request: { query: USERS_QUERY, variables: { skip: 0, take: 20, search: undefined } },
      result: { data: { users: { items: USERS, total: 45 } } },
    };
    const page1Mock: MockLink.MockedResponse = {
      request: { query: USERS_QUERY, variables: { skip: 20, take: 20, search: undefined } },
      result: { data: { users: { items: [{ id: "u-3", name: "Carol Day", email: "carol@test.com", role: "SALES_REP", isActive: true, createdAt: "2026-03-01T00:00:00.000Z" }], total: 45 } } },
    };
    renderPage([page0Mock, page1Mock]);
    await screen.findByText("Alice Smith");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Carol Day");
    expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();
  });

  it("closes invite Done button after success", async () => {
    const inviteMock: MockLink.MockedResponse = {
      request: {
        query: INVITE_USER_MUTATION,
        variables: { name: "Carol Davis", email: "carol@test.com", role: "SALES_REP" },
      },
      result: { data: { inviteUser: true } },
    };
    renderPage([usersMock(), inviteMock, usersMock()]);
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

  it("submits invite and shows success state", async () => {
    const inviteMock: MockLink.MockedResponse = {
      request: {
        query: INVITE_USER_MUTATION,
        variables: { name: "Carol Davis", email: "carol@test.com", role: "SALES_REP" },
      },
      result: { data: { inviteUser: true } },
    };
    renderPage([usersMock(), inviteMock, usersMock()]);
    await screen.findByText("Alice Smith");
    fireEvent.click(screen.getByRole("button", { name: "Invite user" }));
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Carol Davis" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "carol@test.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send invite" }));
    await screen.findByText("Invite sent");
    expect(screen.getByText(/carol@test.com/)).toBeInTheDocument();
  });

  it("shows invite error when mutation fails", async () => {
    const inviteMock: MockLink.MockedResponse = {
      request: {
        query: INVITE_USER_MUTATION,
        variables: { name: "Carol Davis", email: "carol@test.com", role: "SALES_REP" },
      },
      result: { errors: [{ message: "A user with that email already exists" }] },
    };
    renderPage([usersMock(), inviteMock]);
    await screen.findByText("Alice Smith");
    fireEvent.click(screen.getByRole("button", { name: "Invite user" }));
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Carol Davis" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "carol@test.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send invite" }));
    await screen.findByText("A user with that email already exists");
  });

  it("filters users when search input changes", async () => {
    const searchMock: MockLink.MockedResponse = {
      request: { query: USERS_QUERY, variables: { skip: 0, take: 20, search: "alice" } },
      result: { data: { users: { items: [USERS[0]], total: 1 } } },
    };
    renderPage([usersMock(), searchMock]);
    await screen.findByText("Alice Smith");
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "alice" } });
    await screen.findByText("Alice Smith");
    expect(screen.queryByText("Bob Jones")).not.toBeInTheDocument();
  });

  it("shows 'No users match your search' when search returns empty", async () => {
    const emptySearchMock: MockLink.MockedResponse = {
      request: { query: USERS_QUERY, variables: { skip: 0, take: 20, search: "zzz" } },
      result: { data: { users: { items: [], total: 0 } } },
    };
    renderPage([usersMock(), emptySearchMock]);
    await screen.findByText("Alice Smith");
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "zzz" } });
    await screen.findByText("No users match your search.");
  });

  it("clears name error when name input changes", async () => {
    renderPage();
    await screen.findByText("Alice Smith");
    fireEvent.click(screen.getByRole("button", { name: "Invite user" }));
    // Submit form directly to bypass the disabled button guard
    fireEvent.submit(document.querySelector("form")!);
    await screen.findByText("Full name is required.");
    // Start typing — error should clear
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "J" } });
    await waitFor(() =>
      expect(screen.queryByText("Full name is required.")).not.toBeInTheDocument(),
    );
  });

  it("clears email error when email input changes", async () => {
    renderPage();
    await screen.findByText("Alice Smith");
    fireEvent.click(screen.getByRole("button", { name: "Invite user" }));
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Jane" } });
    // Submit form directly to trigger email validation
    fireEvent.submit(document.querySelector("form")!);
    await screen.findByText("Email is required.");
    // Type an invalid email — error should clear on change, then show on next submit attempt
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "bad" } });
    await waitFor(() =>
      expect(screen.queryByText("Email is required.")).not.toBeInTheDocument(),
    );
  });

  it("navigates to previous page when Previous is clicked", async () => {
    const page0Mock: MockLink.MockedResponse = {
      request: { query: USERS_QUERY, variables: { skip: 0, take: 20, search: undefined } },
      result: { data: { users: { items: USERS, total: 45 } } },
    };
    const page1Mock: MockLink.MockedResponse = {
      request: { query: USERS_QUERY, variables: { skip: 20, take: 20, search: undefined } },
      result: { data: { users: { items: [{ id: "u-3", name: "Carol Day", email: "carol@test.com", role: "SALES_REP", isActive: true, createdAt: "2026-03-01T00:00:00.000Z" }], total: 45 } } },
    };
    const page0Again: MockLink.MockedResponse = {
      request: { query: USERS_QUERY, variables: { skip: 0, take: 20, search: undefined } },
      result: { data: { users: { items: USERS, total: 45 } } },
    };
    renderPage([page0Mock, page1Mock, page0Again]);
    await screen.findByText("Alice Smith");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Carol Day");
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    await screen.findByText("Alice Smith");
    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
  });

  it("changes role to Sales Manager in invite form", async () => {
    renderPage();
    await screen.findByText("Alice Smith");
    fireEvent.click(screen.getByRole("button", { name: "Invite user" }));
    await screen.findByRole("heading", { name: "Invite user" });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "SALES_MANAGER" } });
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("SALES_MANAGER");
  });

  it("closes deactivate dialog when backdrop is clicked", async () => {
    renderPage();
    await screen.findByText("Alice Smith");
    fireEvent.click(screen.getAllByRole("button", { name: "Deactivate" })[0]);
    await screen.findByText("Deactivate user?");
    // Click the backdrop (second aria-hidden overlay — the deactivate dialog's)
    const backdrops = document.querySelectorAll('[aria-hidden="true"]');
    fireEvent.click(backdrops[backdrops.length - 1]!);
    await waitFor(() =>
      expect(screen.queryByText("Deactivate user?")).not.toBeInTheDocument(),
    );
  });
});
