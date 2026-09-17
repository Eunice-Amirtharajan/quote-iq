import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing/react";
import { beforeAll } from "vitest";
import PlaybookPage from "./PlaybookPage";
import { HAS_READY_DOCUMENTS_QUERY } from "../graphql/queries";
import { ASK_PLAYBOOK_MUTATION } from "../graphql/mutations";
import type { MockLink } from "@apollo/client/testing";

beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = () => {};
});

const gateMock = (hasReady: boolean): MockLink.MockedResponse => ({
  request: { query: HAS_READY_DOCUMENTS_QUERY },
  result: { data: { hasReadyDocuments: hasReady } },
});

const askMock = (
  question: string,
  answer: string,
  citations: { documentTitle: string; chunkIndex: number; excerpt: string }[] = [],
): MockLink.MockedResponse => ({
  request: { query: ASK_PLAYBOOK_MUTATION, variables: { question } },
  result: { data: { askPlaybook: { answer, citations } } },
});

const render_ = (mocks: MockLink.MockedResponse[]) =>
  render(
    <MockedProvider mocks={mocks}>
      <PlaybookPage />
    </MockedProvider>,
  );

describe("PlaybookPage", () => {
  it("shows loading state initially", () => {
    render_([gateMock(true)]);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("shows empty state when no ready documents exist", async () => {
    render_([gateMock(false)]);
    expect(await screen.findByText(/no playbook documents available yet/i)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/ask about the sales playbook/i)).not.toBeInTheDocument();
  });

  it("shows chat UI when ready documents exist", async () => {
    render_([gateMock(true)]);
    expect(
      await screen.findByPlaceholderText(/ask about the sales playbook/i),
    ).toBeInTheDocument();
  });

  it("shows prompt hint in empty chat", async () => {
    render_([gateMock(true)]);
    await screen.findByPlaceholderText(/ask about the sales playbook/i);
    expect(screen.getByText(/ask the playbook anything/i)).toBeInTheDocument();
  });

  it("Send button is disabled when input is empty", async () => {
    render_([gateMock(true)]);
    await screen.findByPlaceholderText(/ask about the sales playbook/i);
    expect(screen.getByRole("button", { name: /send/i })).toBeDisabled();
  });

  it("Send button is enabled when input has text", async () => {
    render_([gateMock(true)]);
    await userEvent.type(
      await screen.findByPlaceholderText(/ask about the sales playbook/i),
      "Hello",
    );
    expect(screen.getByRole("button", { name: /send/i })).not.toBeDisabled();
  });

  it("displays user message and AI answer after sending", async () => {
    render_([
      gateMock(true),
      askMock("How do I handle objections?", "Focus on value, not price."),
    ]);
    const input = await screen.findByPlaceholderText(/ask about the sales playbook/i);
    await userEvent.type(input, "How do I handle objections?");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));
    expect(await screen.findByText("How do I handle objections?")).toBeInTheDocument();
    expect(await screen.findByText("Focus on value, not price.")).toBeInTheDocument();
  });

  it("clears input after send", async () => {
    render_([
      gateMock(true),
      askMock("Quick question?", "Quick answer."),
    ]);
    const input = await screen.findByPlaceholderText(/ask about the sales playbook/i);
    await userEvent.type(input, "Quick question?");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));
    expect(input).toHaveValue("");
  });

  it("shows error message when mutation fails", async () => {
    render_([
      gateMock(true),
      {
        request: { query: ASK_PLAYBOOK_MUTATION, variables: { question: "Bad question?" } },
        error: new Error("AI service down"),
      },
    ]);
    const input = await screen.findByPlaceholderText(/ask about the sales playbook/i);
    await userEvent.type(input, "Bad question?");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));
    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument();
  });

  it("renders citations toggle when answer has citations", async () => {
    render_([
      gateMock(true),
      askMock("What's the discount policy?", "Max 15% without approval.", [
        { documentTitle: "Pricing Guide", chunkIndex: 3, excerpt: "Discounts above 15%..." },
      ]),
    ]);
    const input = await screen.findByPlaceholderText(/ask about the sales playbook/i);
    await userEvent.type(input, "What's the discount policy?");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));
    expect(await screen.findByText(/show 1 source/i)).toBeInTheDocument();
  });

  it("toggles citations visibility on click", async () => {
    render_([
      gateMock(true),
      askMock("What's the discount policy?", "Max 15% without approval.", [
        { documentTitle: "Pricing Guide", chunkIndex: 3, excerpt: "Discounts above 15%..." },
      ]),
    ]);
    const input = await screen.findByPlaceholderText(/ask about the sales playbook/i);
    await userEvent.type(input, "What's the discount policy?");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));
    const toggle = await screen.findByText(/show 1 source/i);
    await userEvent.click(toggle);
    expect(screen.getByText(/Pricing Guide/)).toBeInTheDocument();
    expect(screen.getByText("Discounts above 15%...")).toBeInTheDocument();
    await userEvent.click(screen.getByText(/hide sources/i));
    expect(screen.queryByText(/Pricing Guide/)).not.toBeInTheDocument();
  });

  it("does not render citations toggle when answer has no citations", async () => {
    render_([
      gateMock(true),
      askMock("General question?", "General answer.", []),
    ]);
    const input = await screen.findByPlaceholderText(/ask about the sales playbook/i);
    await userEvent.type(input, "General question?");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));
    await screen.findByText("General answer.");
    expect(screen.queryByText(/show.*source/i)).not.toBeInTheDocument();
  });

  it("sends on Enter key press", async () => {
    render_([
      gateMock(true),
      askMock("Enter key test?", "Works!"),
    ]);
    const input = await screen.findByPlaceholderText(/ask about the sales playbook/i);
    await userEvent.type(input, "Enter key test?{Enter}");
    expect(await screen.findByText("Works!")).toBeInTheDocument();
  });

  it("empty-state message suggests contacting a Sales Manager", async () => {
    render_([gateMock(false)]);
    expect(
      await screen.findByText(/ask a sales manager/i),
    ).toBeInTheDocument();
  });
});
