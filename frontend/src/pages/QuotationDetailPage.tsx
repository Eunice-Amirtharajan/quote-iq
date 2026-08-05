import { useState } from "react";
import { useQuery, useMutation } from "@apollo/client/react";
import {
  QUOTATION_QUERY,
  QUOTATIONS_QUERY,
  CONVERSION_SCORE_QUERY,
  STATUS_HISTORY_QUERY,
} from "../graphql/queries";
import {
  UPDATE_QUOTATION_STATUS_MUTATION,
  DELETE_QUOTATION_MUTATION,
} from "../graphql/mutations";
import { useAuth } from "../hooks/useAuth";
import AIInsightCard from "../components/AIInsightCard";
import CreateQuotationModal from "../components/CreateQuotationModal";

interface QuotationItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  sortOrder: number;
}

interface QuotationDetail {
  id: string;
  quotationNumber: string;
  version: number;
  title: string;
  status: string;
  notes: string | null;
  taxRate: number;
  subtotal: number;
  taxAmount: number;
  total: number;
  createdAt: string;
  clientName: string;
  publicToken: string;
  createdBy: {
    id: string;
    name: string;
  };
  items: QuotationItem[];
}

interface StatusHistoryEntry {
  id: string;
  fromStatus: string;
  toStatus: string;
  note: string | null;
  changedAt: string;
  changedBy: { name: string } | null;
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

function StatusTimeline({ quotationId }: Readonly<{ quotationId: string }>) {
  const { data, loading } = useQuery<{ statusHistory: StatusHistoryEntry[] }>(
    STATUS_HISTORY_QUERY,
    { variables: { quotationId } },
  );

  if (loading)
    return (
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <div className="h-4 bg-gray-100 rounded animate-pulse w-32 mb-3" />
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-4 bg-gray-100 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );

  const entries = data?.statusHistory ?? [];
  if (entries.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <h3 className="text-sm font-medium text-gray-900 mb-4">Status History</h3>
      <ol className="relative border-l border-gray-100 space-y-4 ml-2">
        {entries.map((e) => {
          const isDraftDraft =
            e.fromStatus === "DRAFT" && e.toStatus === "DRAFT";
          const isCreated = isDraftDraft && !e.note;
          const isEdited = isDraftDraft && !!e.note;
          return (
            <li key={e.id} className="ml-4">
              <span className="absolute -left-1.5 mt-1 w-3 h-3 rounded-full border-2 border-white bg-gray-300" />
              {isCreated && (
                <span className="text-xs font-medium text-gray-700">
                  Created
                </span>
              )}
              {isEdited && (
                <span className="text-xs font-medium text-gray-700">
                  Edited
                </span>
              )}
              {!isDraftDraft && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-gray-400">
                    {STATUS_LABELS[e.fromStatus] ?? e.fromStatus}
                  </span>
                  <span className="text-xs text-gray-300">→</span>
                  <span className="text-xs font-medium text-gray-700">
                    {STATUS_LABELS[e.toStatus] ?? e.toStatus}
                  </span>
                </div>
              )}
              <p className="text-xs text-gray-400 mt-0.5">
                {new Date(e.changedAt).toLocaleDateString("en-DE", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
                {e.changedBy ? ` · ${e.changedBy.name}` : ""}
              </p>
              {e.note && (
                <p className="text-xs text-gray-500 mt-0.5 italic">{e.note}</p>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function ConversionScoreCard({
  quotationId,
}: Readonly<{ quotationId: string }>) {
  const { data, loading } = useQuery<{ conversionScore: { score: number } }>(
    CONVERSION_SCORE_QUERY,
    { variables: { quotationId } },
  );

  if (loading)
    return (
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <div className="h-4 bg-gray-100 rounded animate-pulse w-32 mb-3" />
        <div className="h-8 bg-gray-100 rounded animate-pulse w-16" />
      </div>
    );

  const s = data?.conversionScore;
  if (!s) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <h3 className="text-sm font-medium text-gray-900 mb-1">Win Chance</h3>
      <p className="text-xs text-gray-400 mb-3">
        Based on client approval history and deal size
      </p>
      <p className="text-3xl font-semibold text-gray-900">
        {s.score}
        <span className="text-lg text-gray-400 font-normal">%</span>
      </p>
    </div>
  );
}

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-600",
  SENT: "bg-blue-50 text-blue-600",
  APPROVED: "bg-green-50 text-green-600",
  REJECTED: "bg-red-50 text-red-600",
};

interface Props {
  id: string;
  onBack: () => void;
}

interface StatusActionsProps {
  quotationId: string;
  status: string;
  createdById: string;
  refetch: () => void;
  onDeleted: () => void;
  onEdit: () => void;
}

function StatusActions({
  quotationId,
  status,
  createdById,
  refetch,
  onDeleted,
  onEdit,
}: Readonly<StatusActionsProps>) {
  const { user } = useAuth();
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [updateStatus] = useMutation(UPDATE_QUOTATION_STATUS_MUTATION, {
    onCompleted: () => {
      setActionError(null);
      setPendingAction(null);
      refetch();
    },
    onError: (err) => {
      setActionError(err.message);
      setPendingAction(null);
    },
  });

  const [deleteQuotation, { loading: deleting }] = useMutation(
    DELETE_QUOTATION_MUTATION,
    {
      refetchQueries: [{ query: QUOTATIONS_QUERY }],
      onCompleted: () => onDeleted(),
      onError: (err) => {
        setActionError(err.message);
        setConfirmDelete(false);
      },
    },
  );

  const act = (newStatus: string) => {
    setActionError(null);
    setPendingAction(newStatus);
    updateStatus({
      variables: { id: quotationId, input: { status: newStatus } },
    }).catch(() => {});
  };

  const isManager = user?.role === "SALES_MANAGER";
  const isOwner = user?.id === createdById;

  const showSend = status === "DRAFT" && isOwner;
  const showEdit = status === "DRAFT" && isOwner;
  const showDelete = status === "DRAFT" && isOwner;
  const showApproveReject = status === "SENT" && isManager;

  if (!showSend && !showApproveReject && !showDelete) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
      <h3 className="text-sm font-medium text-gray-900">Actions</h3>
      {actionError && (
        <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">
          {actionError}
        </p>
      )}
      <div className="flex flex-col gap-2">
        {showEdit && (
          <button
            onClick={onEdit}
            disabled={pendingAction !== null || deleting}
            className="w-full py-2 px-4 rounded-lg text-sm font-medium border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Edit Draft
          </button>
        )}
        {showSend && (
          <button
            onClick={() => act("SENT")}
            disabled={pendingAction !== null || deleting}
            className="w-full py-2 px-4 rounded-lg text-sm font-medium bg-gray-900 text-white hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {pendingAction === "SENT" ? "Submitting…" : "Submit for Approval"}
          </button>
        )}
        {showApproveReject && (
          <>
            <button
              onClick={() => act("APPROVED")}
              disabled={pendingAction !== null}
              className="w-full py-2 px-4 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {pendingAction === "APPROVED" ? "Approving…" : "Approve"}
            </button>
            <button
              onClick={() => act("REJECTED")}
              disabled={pendingAction !== null}
              className="w-full py-2 px-4 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {pendingAction === "REJECTED" ? "Rejecting…" : "Reject"}
            </button>
          </>
        )}
        {showDelete && !confirmDelete && (
          <button
            onClick={() => setConfirmDelete(true)}
            disabled={pendingAction !== null || deleting}
            className="w-full py-2 px-4 rounded-lg text-sm font-medium border border-red-200 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Delete Draft
          </button>
        )}
        {showDelete && confirmDelete && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-2">
            <p className="text-xs text-red-700 font-medium">
              Delete this draft permanently?
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  deleteQuotation({ variables: { id: quotationId } }).catch(
                    () => {},
                  );
                }}
                disabled={deleting}
                className="flex-1 py-1.5 px-3 rounded-lg text-xs font-medium bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleting ? "Deleting…" : "Yes, delete"}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                className="flex-1 py-1.5 px-3 rounded-lg text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function QuotationDetailPage({ id, onBack }: Readonly<Props>) {
  const { user } = useAuth();
  const isManager = user?.role === "SALES_MANAGER";
  const [showEdit, setShowEdit] = useState(false);
  const [showCopyConfirmation, setShowCopyConfirmation] = useState(false);  
  const { data, loading, error, refetch } = useQuery<{
    quotation: QuotationDetail;
  }>(QUOTATION_QUERY, { variables: { id } });
  const showCopyLink = (quoteData: QuotationDetail) => {
    return (
      quoteData.status === "SENT" ||
      quoteData.status === "APPROVED" ||
      quoteData.status === "REJECTED"
    );
  };
  const copyQuoteLink = (quoteData: QuotationDetail) => {
    navigator.clipboard?.writeText(
      `${window.location.origin}/view-quotation/${quoteData.publicToken}`,
    );
    setShowCopyConfirmation(true);
    setTimeout(() => setShowCopyConfirmation(false), 2000);
  };

  if (loading)
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-400 text-sm">Loading...</p>
      </div>
    );

  if (error)
    return (
      <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">
        Failed to load quotation
      </div>
    );

  const q = data?.quotation;

  if (!q)
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <p className="text-gray-500 text-sm">
          Quotation not found or access denied.
        </p>
        <button
          onClick={onBack}
          className="text-sm text-gray-400 hover:text-gray-900 transition-colors"
        >
          ← Back to Quotations
        </button>
      </div>
    );

  return (
    <div>
      {showEdit && q.status === "DRAFT" && (
        <CreateQuotationModal
          quotation={{
            id: q.id,
            version: q.version,
            title: q.title,
            clientName: q.clientName,
            notes: q.notes ?? null,
            taxRate: q.taxRate,
            items: q.items,
          }}
          onClose={() => {
            setShowEdit(false);
            refetch();
          }}
          onCreated={() => setShowEdit(false)}
        />
      )}

      {/* Header */}
      <div className="flex items-center gap-2 mb-6 text-sm">
        <button
          onClick={onBack}
          className="text-gray-400 hover:text-gray-900 transition-colors"
        >
          Quotations
        </button>
        <span className="text-gray-300">/</span>
        <span className="text-gray-900 font-medium">{q.title}</span>
        <span
          className={`inline-flex text-xs font-medium px-2 py-1 rounded-full ${STATUS_STYLES[q.status] ?? "bg-gray-100 text-gray-600"}`}
        >
          {q.status}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Left — main content */}
        <div className="col-span-2 space-y-6">
          {/* Line items */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h3 className="text-sm font-medium text-gray-900">Line Items</h3>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-50">
                  <th className="text-left text-xs font-medium text-gray-400 px-6 py-3">
                    Description
                  </th>
                  <th className="text-right text-xs font-medium text-gray-400 px-6 py-3">
                    Qty
                  </th>
                  <th className="text-right text-xs font-medium text-gray-400 px-6 py-3">
                    Unit Price
                  </th>
                  <th className="text-right text-xs font-medium text-gray-400 px-6 py-3">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {q.items
                  .slice()
                  .sort((a, b) => a.sortOrder - b.sortOrder)
                  .map((item) => (
                    <tr key={item.id}>
                      <td className="px-6 py-3 text-sm text-gray-900">
                        {item.description}
                      </td>
                      <td className="px-6 py-3 text-sm text-gray-500 text-right">
                        {item.quantity}
                      </td>
                      <td className="px-6 py-3 text-sm text-gray-500 text-right">
                        €{item.unitPrice.toLocaleString()}
                      </td>
                      <td className="px-6 py-3 text-sm font-medium text-gray-900 text-right">
                        €{item.lineTotal.toLocaleString()}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>

            {/* Totals */}
            <div className="px-6 py-4 border-t border-gray-100 space-y-2">
              <div className="flex justify-between text-sm text-gray-500">
                <span>Subtotal</span>
                <span>€{q.subtotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-500">
                <span>Tax ({q.taxRate}%)</span>
                <span>€{q.taxAmount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm font-semibold text-gray-900 pt-2 border-t border-gray-100">
                <span>Total</span>
                <span>€{q.total.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          {q.notes && (
            <div className="bg-white rounded-xl border border-gray-100 p-6">
              <h3 className="text-sm font-medium text-gray-900 mb-2">Notes</h3>
              <p className="text-sm text-gray-500">{q.notes}</p>
            </div>
          )}
        </div>

        {/* Right — metadata + actions */}
        <div className="space-y-4">
          <StatusActions
            quotationId={q.id}
            status={q.status}
            createdById={q.createdBy.id}
            refetch={refetch}
            onDeleted={onBack}
            onEdit={() => setShowEdit(true)}
          />

          {/* Quotation info */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h3 className="text-sm font-medium text-gray-900 mb-4">Details</h3>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-gray-400">Number</p>
                <p className="text-sm font-mono text-gray-700">
                  {q.quotationNumber}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Created</p>
                <p className="text-sm text-gray-700">
                  {new Date(q.createdAt).toLocaleDateString("en-DE")}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Created By</p>
                <p className="text-sm text-gray-700">{q.createdBy.name}</p>
              </div>
              <div>
                {showCopyLink(q) && (
                  <>
                    <p className="text-xs text-gray-400">Share Link</p>
                    <button
                      className="text-xs text-blue-600 hover:text-blue-800 underline cursor-pointer"
                      onClick={() => copyQuoteLink(q)}
                    >
                      Copy link
                    </button>
                    {showCopyConfirmation && (
                      <span className="text-xs font-bold text-black px-2">Copied!</span>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Client info */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h3 className="text-sm font-medium text-gray-900 mb-4">Client</h3>
            <div>
              <p className="text-xs text-gray-400">Name</p>
              <p className="text-sm text-gray-700">{q.clientName}</p>
            </div>
          </div>

          <StatusTimeline quotationId={id} />
          <AIInsightCard quotationId={id} />
          {q.status === "SENT" && isManager && (
            <ConversionScoreCard quotationId={id} />
          )}
        </div>
      </div>
    </div>
  );
}
