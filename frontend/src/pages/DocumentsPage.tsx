import { useRef, useState } from "react";
import { useQuery, useMutation } from "@apollo/client/react";
import { NetworkStatus } from "@apollo/client";
import { sanitizeText } from "../utils/sanitize";
import { DOCUMENTS_QUERY } from "../graphql/queries";
import {
  APPROVE_DOCUMENT_MUTATION,
  REJECT_DOCUMENT_MUTATION,
  DELETE_DOCUMENT_MUTATION,
} from "../graphql/mutations";

type DocumentStatus =
  | "PENDING_SCAN"
  | "SCANNING"
  | "PENDING_REVIEW"
  | "READY"
  | "REJECTED"
  | "FAILED";

interface Document {
  id: string;
  filename: string;
  sizeBytes: number;
  status: DocumentStatus;
  rejectedReason?: string | null;
  createdAt: string;
}

const STATUS_LABEL: Record<DocumentStatus, string> = {
  PENDING_SCAN: "Queued",
  SCANNING: "Scanning",
  PENDING_REVIEW: "Needs review",
  READY: "Ready",
  REJECTED: "Rejected",
  FAILED: "Failed",
};

const STATUS_CLASS: Record<DocumentStatus, string> = {
  PENDING_SCAN: "bg-gray-100 text-gray-600",
  SCANNING: "bg-blue-50 text-blue-600",
  PENDING_REVIEW: "bg-amber-50 text-amber-700",
  READY: "bg-green-50 text-green-700",
  REJECTED: "bg-red-50 text-red-600",
  FAILED: "bg-red-50 text-red-600",
};

function fmtBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

interface RejectModalProps {
  filename: string;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

function RejectModal({ filename, onConfirm, onCancel }: Readonly<RejectModalProps>) {
  const [reason, setReason] = useState("");
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
        <h2 className="text-base font-semibold text-gray-900 mb-1">Reject document</h2>
        <p className="text-sm text-gray-500 mb-4 truncate">{filename}</p>
        <textarea
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gray-900"
          rows={3}
          maxLength={500}
          placeholder="Reason for rejection…"
          value={reason}
          onChange={(e) => setReason(sanitizeText(e.target.value).slice(0, 500))}
        />
        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!reason.trim()}
            onClick={() => onConfirm(reason.trim())}
            className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-40"
          >
            Reject
          </button>
        </div>
      </div>
    </div>
  );
}

interface DeleteModalProps {
  filename: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function DeleteModal({ filename, onConfirm, onCancel }: Readonly<DeleteModalProps>) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
        <h2 className="text-base font-semibold text-gray-900 mb-1">Delete document?</h2>
        <p className="text-sm text-gray-500 mb-4 truncate">{filename}</p>
        <p className="text-sm text-gray-600 mb-6">
          This will permanently remove the document and all its chunks. This action cannot be undone.
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DocumentsPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<Document | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Document | null>(null);

  const { data, previousData, loading, networkStatus, error, refetch } = useQuery<{ documents: Document[] }>(
    DOCUMENTS_QUERY,
    { fetchPolicy: "network-only", notifyOnNetworkStatusChange: true },
  );
  const initialLoading = loading && networkStatus === NetworkStatus.loading;

  const [approve] = useMutation(APPROVE_DOCUMENT_MUTATION, {
    onCompleted: () => refetch(),
    onError: (e) => setMutationError(e.message),
  });
  const [reject] = useMutation(REJECT_DOCUMENT_MUTATION, {
    onCompleted: () => { setRejectTarget(null); refetch(); },
    onError: (e) => setMutationError(e.message),
  });
  const [deleteDoc] = useMutation(DELETE_DOCUMENT_MUTATION, {
    onCompleted: () => { setDeleteTarget(null); refetch(); },
    onError: (e) => { setDeleteTarget(null); setMutationError(e.message); },
  });

  async function handleUpload(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const apiBase = import.meta.env.VITE_API_URL
        ? import.meta.env.VITE_API_URL.replace("/graphql", "")
        : "http://localhost:4000";
      const res = await fetch(`${apiBase}/documents/upload`, {
        method: "POST",
        body: form,
        credentials: "include",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? `Upload failed (${res.status})`);
      }
      await refetch();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const uploadEnabled = import.meta.env.VITE_UPLOAD_ENABLED === "true";
  // Keep showing stale rows during a background refetch so the table doesn't flicker out
  const docs = (data ?? previousData)?.documents ?? [];

  return (
    <div className="max-w-4xl mx-auto">
      {rejectTarget && (
        <RejectModal
          filename={rejectTarget.filename}
          onConfirm={(reason) =>
            /* v8 ignore next */
            reject({ variables: { id: rejectTarget.id, reason } }).catch(() => {})
          }
          onCancel={() => setRejectTarget(null)}
        />
      )}

      {deleteTarget && (
        <DeleteModal
          filename={deleteTarget.filename}
          onConfirm={() =>
            /* v8 ignore next */
            deleteDoc({ variables: { id: deleteTarget.id } }).catch(() => {})
          }
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Playbook documents</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {uploadEnabled
              ? "Upload PDFs for the sales-rep playbook RAG"
              : "Read-only demo — uploads are disabled in this deployment"}
          </p>
        </div>
        {uploadEnabled && (
          <>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              {uploading ? "Uploading…" : "+ Upload PDF"}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUpload(f).catch(() => {});
              }}
            />
          </>
        )}
      </div>

      {uploadError && (
        <div className="mb-4 bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">
          {uploadError}
        </div>
      )}

      {mutationError && (
        <div className="mb-4 bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm flex items-center justify-between gap-4">
          <span>{mutationError}</span>
          <button
            type="button"
            onClick={() => setMutationError(null)}
            className="shrink-0 text-red-400 hover:text-red-600"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {initialLoading && (
        <div className="flex items-center justify-center h-48">
          <p className="text-gray-400 text-sm">Loading…</p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">
          Failed to load documents
        </div>
      )}

      {!initialLoading && !error && docs.length === 0 && (
        <div className="flex flex-col items-center justify-center h-48 text-center">
          <p className="text-gray-400 text-sm">No documents yet.</p>
          <p className="text-gray-300 text-xs mt-1">
            Upload a PDF to get started.
          </p>
        </div>
      )}

      {docs.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left">
                <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide">
                  File
                </th>
                <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide">
                  Size
                </th>
                <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide">
                  Uploaded
                </th>
                <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide">
                  Status
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {docs.map((doc) => (
                <tr key={doc.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                  <td className="px-4 py-3 font-medium text-gray-900 max-w-xs truncate">
                    {doc.filename}
                    {doc.rejectedReason && (
                      <p className="text-xs text-red-500 font-normal truncate">
                        {doc.rejectedReason}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{fmtBytes(doc.sizeBytes)}</td>
                  <td className="px-4 py-3 text-gray-500">{fmtDate(doc.createdAt)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CLASS[doc.status]}`}
                    >
                      {STATUS_LABEL[doc.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 justify-end items-center">
                      {doc.status === "PENDING_REVIEW" && (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              approve({ variables: { id: doc.id } }).catch(() => {})
                            }
                            className="px-3 py-1 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => { setMutationError(null); setRejectTarget(doc); }}
                            className="px-3 py-1 text-xs border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                          >
                            Reject
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        title="Delete document"
                        onClick={() => { setMutationError(null); setDeleteTarget(doc); }}
                        disabled={doc.status === 'SCANNING'}
                        className="p-1.5 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        aria-label="Delete document"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                          <path d="M10 11v6M14 11v6" />
                          <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
