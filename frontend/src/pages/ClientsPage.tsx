import { useState, useCallback } from "react";
import { useQuery, useMutation } from "@apollo/client/react";
import { sanitizeText } from "../utils/sanitize";
import { CLIENTS_PAGE_QUERY, CLIENTS_QUERY } from "../graphql/queries";
import { CREATE_CLIENT_MUTATION, DELETE_CLIENT_MUTATION } from "../graphql/mutations";

interface Client {
  id: string;
  name: string;
  email?: string | null;
  createdAt: string;
}

const PAGE_SIZE = 50;

export default function ClientsPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [pendingDelete, setPendingDelete] = useState<Client | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { data, loading, error } = useQuery<{
    clientsPage: { items: Client[]; total: number };
  }>(CLIENTS_PAGE_QUERY, {
    variables: { search: search || undefined, skip: page * PAGE_SIZE, take: PAGE_SIZE },
    fetchPolicy: "cache-and-network",
  });

  const clients = data?.clientsPage.items ?? [];
  const total = data?.clientsPage.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const [createClient] = useMutation<{ createClient: Client }>(
    CREATE_CLIENT_MUTATION,
    { refetchQueries: [{ query: CLIENTS_PAGE_QUERY, variables: { skip: 0, take: PAGE_SIZE } }, { query: CLIENTS_QUERY }] },
  );

  const [deleteClientMutation] = useMutation<{ deleteClient: boolean }>(
    DELETE_CLIENT_MUTATION,
    { refetchQueries: [{ query: CLIENTS_PAGE_QUERY, variables: { search: search || undefined, skip: page * PAGE_SIZE, take: PAGE_SIZE } }, { query: CLIENTS_QUERY }] },
  );

  const handleDeleteConfirm = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteClientMutation({ variables: { id: pendingDelete.id } });
      setPendingDelete(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to delete client.";
      setDeleteError(msg.replace("GraphQL error: ", "").replace("ApolloError: ", ""));
    } finally {
      setDeleting(false);
    }
  };

  const handleSearch = useCallback((v: string) => {
    setSearch(v);
    setPage(0);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const trimmedName = name.trim();
    if (!trimmedName) {
      setFormError("Client name is required.");
      return;
    }
    setCreating(true);
    try {
      await createClient({ variables: { name: trimmedName, email: email.trim() || undefined } });
      setName("");
      setEmail("");
      setPage(0);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create client.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Clients</h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage the client list. Sales reps select from these when creating quotations.
        </p>
      </div>

      {/* Add client form */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Add client</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label htmlFor="clientName" className="block text-xs font-medium text-gray-700 mb-1">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              id="clientName"
              type="text"
              value={name}
              onChange={(e) => setName(sanitizeText(e.target.value).slice(0, 100))}
              maxLength={100}
              placeholder="e.g. Bauer Logistics GmbH"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>
          <div>
            <label htmlFor="clientEmail" className="block text-xs font-medium text-gray-700 mb-1">
              Email <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              id="clientEmail"
              type="text"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="contact@example.com"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>
          {formError && (
            <p className="text-xs text-red-600">{formError}</p>
          )}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={creating}
              className="px-4 py-2 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {creating ? "Adding…" : "Add Client"}
            </button>
          </div>
        </form>
      </div>

      {/* Client list */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-gray-900 shrink-0">
            {loading && !data ? "Loading…" : `${total.toLocaleString()} client${total !== 1 ? "s" : ""}`}
          </span>
          <input
            type="search"
            value={search}
            onChange={(e) => handleSearch(sanitizeText(e.target.value))}
            placeholder="Search by name…"
            className="w-48 px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>

        {error && (
          <p className="px-5 py-4 text-sm text-red-600">Failed to load clients.</p>
        )}

        {!loading && !error && clients.length === 0 && (
          <p className="px-5 py-4 text-sm text-gray-400">
            {search ? "No clients match your search." : "No clients yet. Add one above."}
          </p>
        )}

        {clients.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 border-b border-gray-50">
                <th className="px-5 py-2 text-left font-medium">Name</th>
                <th className="px-5 py-2 text-left font-medium">Email</th>
                <th className="px-5 py-2" />
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 group">
                  <td className="px-5 py-3 font-medium text-gray-900">{c.name}</td>
                  <td className="px-5 py-3 text-gray-500">{c.email ?? "—"}</td>
                  <td className="px-5 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => { setPendingDelete(c); setDeleteError(null); }}
                      className="text-xs text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-label={`Delete ${c.name}`}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Delete confirm modal */}
        {pendingDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm mx-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Delete client?</h3>
              <p className="text-sm text-gray-500 mb-4">
                This will permanently remove{" "}
                <span className="font-medium text-gray-800">{pendingDelete.name}</span>.
                This cannot be undone.
              </p>
              {deleteError && (
                <p className="text-xs text-red-600 mb-4">
                  {deleteError}
                </p>
              )}
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => { setPendingDelete(null); setDeleteError(null); }}
                  disabled={deleting}
                  className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteConfirm}
                  disabled={deleting || !!deleteError}
                  className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {deleting ? "Deleting…" : "Delete"}
                </button>
              </div>
            </div>
          </div>
        )}

        {totalPages > 1 && (
          <div className="px-5 py-3 border-t border-gray-50 flex items-center justify-between text-xs text-gray-500">
            <span>
              {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total.toLocaleString()}
            </span>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setPage((p) => p - 1)}
                disabled={page === 0}
                className="px-2.5 py-1 rounded-md border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                ‹ Prev
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= totalPages - 1}
                className="px-2.5 py-1 rounded-md border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next ›
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
