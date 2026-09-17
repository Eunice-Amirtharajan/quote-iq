import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing/react";
import { vi } from "vitest";
import DocumentsPage from "./DocumentsPage";
import { DOCUMENTS_QUERY } from "../graphql/queries";
import {
  APPROVE_DOCUMENT_MUTATION,
  REJECT_DOCUMENT_MUTATION,
  DELETE_DOCUMENT_MUTATION,
} from "../graphql/mutations";
import type { MockLink } from "@apollo/client/testing";

interface DocRow {
  id: string;
  filename: string;
  sizeBytes: number;
  status: "PENDING_SCAN" | "SCANNING" | "PENDING_REVIEW" | "READY" | "REJECTED" | "FAILED";
  rejectedReason: string | null;
  createdAt: string;
}

const makeDoc = (overrides: Partial<DocRow> = {}): DocRow => ({
  id: "doc-1",
  filename: "sales-playbook.pdf",
  sizeBytes: 102400,
  status: "PENDING_REVIEW",
  rejectedReason: null,
  createdAt: "2026-09-10T10:00:00.000Z",
  ...overrides,
});

const docs: DocRow[] = [makeDoc()];

const docsMock = (rows = docs): MockLink.MockedResponse => ({
  request: { query: DOCUMENTS_QUERY },
  result: { data: { documents: rows } },
});

const render_ = (mocks: MockLink.MockedResponse[]) =>
  render(
    <MockedProvider mocks={mocks}>
      <DocumentsPage />
    </MockedProvider>,
  );

describe("DocumentsPage", () => {
  it("shows loading state initially", () => {
    render_([docsMock()]);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("renders document filename after load", async () => {
    render_([docsMock()]);
    expect(await screen.findByText("sales-playbook.pdf")).toBeInTheDocument();
  });

  it("shows empty state when no documents exist", async () => {
    render_([docsMock([])]);
    expect(await screen.findByText(/no documents yet/i)).toBeInTheDocument();
  });

  it("shows error state on query failure", async () => {
    render_([{ request: { query: DOCUMENTS_QUERY }, error: new Error("Network error") }]);
    expect(await screen.findByText(/failed to load documents/i)).toBeInTheDocument();
  });

  it("renders status badge for PENDING_REVIEW as 'Needs review'", async () => {
    render_([docsMock()]);
    expect(await screen.findByText("Needs review")).toBeInTheDocument();
  });

  it("renders status badge for READY", async () => {
    render_([docsMock([makeDoc({ status: "READY" })])]);
    expect(await screen.findByText("Ready")).toBeInTheDocument();
  });

  it("renders status badge for SCANNING", async () => {
    render_([docsMock([makeDoc({ status: "SCANNING" })])]);
    expect(await screen.findByText("Scanning")).toBeInTheDocument();
  });

  it("shows Approve and Reject buttons only for PENDING_REVIEW", async () => {
    render_([docsMock()]);
    await screen.findByText("sales-playbook.pdf");
    expect(screen.getByRole("button", { name: /approve/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reject/i })).toBeInTheDocument();
  });

  it("does not show Approve/Reject for READY document", async () => {
    render_([docsMock([makeDoc({ status: "READY" })])]);
    await screen.findByText("sales-playbook.pdf");
    expect(screen.queryByRole("button", { name: /approve/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /reject/i })).not.toBeInTheDocument();
  });

  it("calls approve mutation and refetches on Approve click", async () => {
    const refetchDoc = makeDoc({ status: "READY" });
    const mocks: MockLink.MockedResponse[] = [
      docsMock(),
      {
        request: { query: APPROVE_DOCUMENT_MUTATION, variables: { id: "doc-1" } },
        result: { data: { approveDocument: { id: "doc-1", status: "READY" } } },
      },
      docsMock([refetchDoc]),
    ];
    render_(mocks);
    await userEvent.click(await screen.findByRole("button", { name: /approve/i }));
    expect(await screen.findByText("Ready")).toBeInTheDocument();
  });

  it("opens reject modal on Reject click", async () => {
    render_([docsMock()]);
    await userEvent.click(await screen.findByRole("button", { name: /^reject$/i }));
    expect(screen.getByText(/reject document/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/reason for rejection/i)).toBeInTheDocument();
  });

  it("Reject button in modal is disabled when reason is empty", async () => {
    render_([docsMock()]);
    await userEvent.click(await screen.findByRole("button", { name: /^reject$/i }));
    // Modal is open — find the Reject button inside the modal overlay
    const modalRejectBtn = screen.getAllByRole("button", { name: /^reject$/i }).find(
      (b) => b.closest(".fixed"),
    );
    expect(modalRejectBtn).toBeDisabled();
  });

  it("calls reject mutation with reason and closes modal", async () => {
    const rejectedDoc = makeDoc({ status: "REJECTED", rejectedReason: "Outdated content" });
    const mocks: MockLink.MockedResponse[] = [
      docsMock(),
      {
        request: {
          query: REJECT_DOCUMENT_MUTATION,
          variables: { id: "doc-1", reason: "Outdated content" },
        },
        result: { data: { rejectDocument: { id: "doc-1", status: "REJECTED" } } },
      },
      docsMock([rejectedDoc]),
    ];
    render_(mocks);
    await userEvent.click(await screen.findByRole("button", { name: /^reject$/i }));
    await userEvent.type(screen.getByPlaceholderText(/reason for rejection/i), "Outdated content");
    const modalRejectBtn = screen.getAllByRole("button", { name: /reject/i }).find(
      (b) => b.closest(".fixed"),
    )!;
    await userEvent.click(modalRejectBtn);
    await waitFor(() =>
      expect(screen.queryByText(/reject document/i)).not.toBeInTheDocument(),
    );
    expect(await screen.findByText("Outdated content")).toBeInTheDocument();
  });

  it("delete button is present on every row", async () => {
    render_([docsMock()]);
    await screen.findByText("sales-playbook.pdf");
    expect(screen.getByRole("button", { name: /delete document/i })).toBeInTheDocument();
  });

  it("delete button is disabled for SCANNING documents", async () => {
    render_([docsMock([makeDoc({ status: "SCANNING" })])]);
    await screen.findByText("sales-playbook.pdf");
    expect(screen.getByRole("button", { name: /delete document/i })).toBeDisabled();
  });

  it("delete button is enabled for non-SCANNING documents", async () => {
    render_([docsMock([makeDoc({ status: "READY" })])]);
    await screen.findByText("sales-playbook.pdf");
    expect(screen.getByRole("button", { name: /delete document/i })).not.toBeDisabled();
  });

  it("opens delete confirmation modal on trash click", async () => {
    render_([docsMock()]);
    await userEvent.click(await screen.findByRole("button", { name: /delete document/i }));
    expect(screen.getByText(/delete document\?/i)).toBeInTheDocument();
    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument();
  });

  it("cancel button in delete modal closes it without calling mutation", async () => {
    render_([docsMock()]);
    await userEvent.click(await screen.findByRole("button", { name: /delete document/i }));
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    await waitFor(() =>
      expect(screen.queryByText(/delete document\?/i)).not.toBeInTheDocument(),
    );
  });

  it("calls delete mutation and refetches on confirm", async () => {
    const mocks: MockLink.MockedResponse[] = [
      docsMock(),
      {
        request: { query: DELETE_DOCUMENT_MUTATION, variables: { id: "doc-1" } },
        result: { data: { deleteDocument: true } },
      },
      docsMock([]),
    ];
    render_(mocks);
    await userEvent.click(await screen.findByRole("button", { name: /delete document/i }));
    await userEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    expect(await screen.findByText(/no documents yet/i)).toBeInTheDocument();
  });

  it("renders file size in human-readable format", async () => {
    render_([docsMock()]);
    expect(await screen.findByText("100.0 KB")).toBeInTheDocument();
  });

  it("renders rejected reason below filename", async () => {
    render_([
      docsMock([makeDoc({ status: "REJECTED", rejectedReason: "Confidential content" })]),
    ]);
    expect(await screen.findByText("Confidential content")).toBeInTheDocument();
  });

  it("hides Upload PDF button when VITE_UPLOAD_ENABLED is not set", async () => {
    render_([docsMock()]);
    await screen.findByText("sales-playbook.pdf");
    expect(screen.queryByRole("button", { name: /upload pdf/i })).not.toBeInTheDocument();
  });

  it("shows read-only notice when upload is disabled", async () => {
    render_([docsMock()]);
    await screen.findByText("sales-playbook.pdf");
    expect(screen.getByText(/read-only demo/i)).toBeInTheDocument();
  });

  it("shows upload error when fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 413, json: async () => ({ message: "File too large" }) }),
    );
    // Enable upload for this test by stubbing the env var
    const original = import.meta.env.VITE_UPLOAD_ENABLED;
    import.meta.env.VITE_UPLOAD_ENABLED = "true";
    render_([docsMock()]);
    await screen.findByText("sales-playbook.pdf");
    const input = document.querySelector("input[type=file]") as HTMLInputElement;
    const file = new File(["a".repeat(100)], "big.pdf", { type: "application/pdf" });
    await userEvent.upload(input, file);
    expect(await screen.findByText(/file too large/i)).toBeInTheDocument();
    import.meta.env.VITE_UPLOAD_ENABLED = original;
    vi.unstubAllGlobals();
  });

  it("renders file size in MB for large files", async () => {
    render_([docsMock([makeDoc({ sizeBytes: 2 * 1024 * 1024 })])]);
    expect(await screen.findByText("2.0 MB")).toBeInTheDocument();
  });

  it("successful upload refetches document list", async () => {
    const uploadedDoc = makeDoc({ status: "PENDING_SCAN" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
    );
    const original = import.meta.env.VITE_UPLOAD_ENABLED;
    import.meta.env.VITE_UPLOAD_ENABLED = "true";
    render_([docsMock(), docsMock([uploadedDoc])]);
    await screen.findByText("sales-playbook.pdf");
    const input = document.querySelector("input[type=file]") as HTMLInputElement;
    const file = new File(["pdf content"], "new.pdf", { type: "application/pdf" });
    await userEvent.upload(input, file);
    expect(await screen.findByText("Queued")).toBeInTheDocument();
    import.meta.env.VITE_UPLOAD_ENABLED = original;
    vi.unstubAllGlobals();
  });

  it("reject mutation error is swallowed gracefully", async () => {
    const mocks: MockLink.MockedResponse[] = [
      docsMock(),
      {
        request: { query: REJECT_DOCUMENT_MUTATION, variables: { id: "doc-1", reason: "Bad" } },
        error: new Error("Network error"),
      },
    ];
    render_(mocks);
    await userEvent.click(await screen.findByRole("button", { name: /^reject$/i }));
    await userEvent.type(screen.getByPlaceholderText(/reason for rejection/i), "Bad");
    const modalRejectBtn = screen.getAllByRole("button", { name: /reject/i }).find(
      (b) => b.closest(".fixed"),
    )!;
    await userEvent.click(modalRejectBtn);
    // modal stays open since mutation failed — no crash
    await waitFor(() =>
      expect(screen.getByText(/reject document/i)).toBeInTheDocument(),
    );
  });

  it("delete mutation error is swallowed gracefully", async () => {
    const mocks: MockLink.MockedResponse[] = [
      docsMock(),
      {
        request: { query: DELETE_DOCUMENT_MUTATION, variables: { id: "doc-1" } },
        error: new Error("Network error"),
      },
    ];
    render_(mocks);
    await userEvent.click(await screen.findByRole("button", { name: /delete document/i }));
    await userEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    // modal stays open — no crash
    await waitFor(() =>
      expect(screen.getByText(/delete document\?/i)).toBeInTheDocument(),
    );
  });
});
