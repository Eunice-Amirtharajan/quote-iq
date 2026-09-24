import { useState } from "react";
import { useQuery, useMutation } from "@apollo/client/react";
import { USERS_QUERY } from "../graphql/queries";
import { INVITE_USER_MUTATION, DEACTIVATE_USER_MUTATION } from "../graphql/mutations";
import { useAuth } from "../hooks/useAuth";

type Role = "SALES_MANAGER" | "SALES_REP";

interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: string;
}

const PAGE_SIZE = 20;

function roleBadge(role: Role) {
  const base = "inline-block px-2 py-0.5 rounded text-xs font-medium";
  return role === "SALES_MANAGER"
    ? `${base} bg-gray-900 text-white`
    : `${base} bg-gray-100 text-gray-700`;
}

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");

  const { data, loading, refetch } = useQuery<{
    users: { items: User[]; total: number };
  }>(USERS_QUERY, {
    variables: { skip: page * PAGE_SIZE, take: PAGE_SIZE, search: search || undefined },
    fetchPolicy: "cache-and-network",
  });

  const users = data?.users.items ?? [];
  const total = data?.users.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Invite modal state
  const [showInvite, setShowInvite] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("SALES_REP");
  const [nameError, setNameError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [formError, setFormError] = useState("");
  const [inviteSent, setInviteSent] = useState(false);

  // Delete confirmation state
  const [pendingDelete, setPendingDelete] = useState<User | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);

  const [inviteUser, { loading: inviting }] = useMutation(INVITE_USER_MUTATION, {
    onCompleted: () => {
      setInviteSent(true);
      refetch().catch(() => {});
    },
    onError: (err) => setFormError(err.message),
  });

  const [deactivateUserMutation] = useMutation(DEACTIVATE_USER_MUTATION);

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const nameValid = name.trim().length > 0;
  const emailValid = EMAIL_RE.test(email.trim());
  const canSubmit = nameValid && emailValid;

  const openInvite = () => {
    setName(""); setEmail(""); setRole("SALES_REP");
    setNameError(""); setEmailError(""); setFormError(""); setInviteSent(false);
    setShowInvite(true);
  };

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    let valid = true;
    if (!nameValid) { setNameError("Full name is required."); valid = false; }
    if (!email.trim()) { setEmailError("Email is required."); valid = false; }
    else if (!emailValid) { setEmailError("Please enter a valid email address."); valid = false; }
    if (!valid) return;
    inviteUser({ variables: { name: name.trim(), email: email.trim(), role } }).catch(() => {});
  };

  const handleDeleteConfirm = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await deactivateUserMutation({ variables: { id: pendingDelete.id } });
      setPendingDelete(null);
      refetch().catch(() => {});
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to delete user.";
      setDeleteError(msg.replace("GraphQL error: ", "").replace("ApolloError: ", ""));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Users</h1>
        <button
          type="button"
          onClick={openInvite}
          className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors"
        >
          Invite user
        </button>
      </div>

      <div className="mb-4">
        <input
          type="search"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          placeholder="Search by name…"
          className="w-full max-w-xs px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
      </div>

      {loading && <p className="text-sm text-gray-400">Loading…</p>}

      {!loading && data && users.length === 0 && (
        <p className="text-sm text-gray-400">
          {search ? "No users match your search." : "No users found."}
        </p>
      )}

      {!loading && data && users.length > 0 && (
        <>
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left">
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Name</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Email</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Role</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Joined</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-gray-50 last:border-0">
                    <td className="px-4 py-3 font-medium text-gray-900">{u.name}</td>
                    <td className="px-4 py-3 text-gray-500">{u.email}</td>
                    <td className="px-4 py-3">
                      <span className={roleBadge(u.role)}>
                        {u.role.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {u.id !== currentUser?.id && (
                        <button
                          type="button"
                          onClick={() => { setDeleteError(""); setPendingDelete(u); }}
                          className="text-xs text-red-500 hover:text-red-700 transition-colors"
                        >
                          Deactivate
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
              <span>{total} users</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => p - 1)}
                  disabled={page === 0}
                  className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Previous
                </button>
                <span className="text-xs">
                  Page {page + 1} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page >= totalPages - 1}
                  className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Invite modal */}
      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowInvite(false)}
            aria-hidden="true"
          />
          <div className="relative bg-white rounded-2xl shadow-lg border border-gray-100 p-6 w-full max-w-sm">
            {inviteSent ? (
              <div className="text-center py-4">
                <div className="text-3xl mb-3">✉️</div>
                <h2 className="text-lg font-semibold text-gray-900 mb-1">Invite sent</h2>
                <p className="text-sm text-gray-500 mb-5">
                  An invitation has been sent to <strong>{email}</strong>. If they don't receive it within a few minutes, please ask them to check their spam or junk folder.
                </p>
                <button
                  type="button"
                  onClick={() => setShowInvite(false)}
                  className="w-full bg-gray-900 text-white py-2 px-4 rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors"
                >
                  Done
                </button>
              </div>
            ) : (
              <>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Invite user</h2>
                <form onSubmit={handleInvite} className="space-y-3">
                  <div>
                    <label htmlFor="inv-name" className="block text-xs font-medium text-gray-700 mb-1">Full name</label>
                    <input
                      id="inv-name"
                      type="text"
                      value={name}
                      onChange={(e) => { setName(e.target.value); if (nameError) setNameError(""); }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                      placeholder="Jane Smith"
                    />
                    {nameError && <p className="mt-1 text-xs text-red-600">{nameError}</p>}
                  </div>
                  <div>
                    <label htmlFor="inv-email" className="block text-xs font-medium text-gray-700 mb-1">Email</label>
                    <input
                      id="inv-email"
                      type="text"
                      inputMode="email"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); if (emailError) setEmailError(""); }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                      placeholder="jane@company.com"
                    />
                    {emailError && <p className="mt-1 text-xs text-red-600">{emailError}</p>}
                  </div>
                  <div>
                    <label htmlFor="inv-role" className="block text-xs font-medium text-gray-700 mb-1">Role</label>
                    <select
                      id="inv-role"
                      value={role}
                      onChange={(e) => setRole(e.target.value as Role)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent bg-white"
                    >
                      <option value="SALES_REP">Sales Rep</option>
                      <option value="SALES_MANAGER">Sales Manager</option>
                    </select>
                  </div>

                  {formError && (
                    <p className="text-sm text-red-600">{formError}</p>
                  )}

                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowInvite(false)}
                      className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={inviting || !canSubmit}
                      className="flex-1 bg-gray-900 text-white py-2 px-4 rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {inviting ? "Sending…" : "Send invite"}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      {/* Deactivate confirmation dialog */}
      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => !deleting && setPendingDelete(null)}
            aria-hidden="true"
          />
          <div className="relative bg-white rounded-2xl shadow-lg border border-gray-100 p-6 w-full max-w-sm">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Deactivate user?</h2>
            <p className="text-sm text-gray-500 mb-1">
              <strong>{pendingDelete.name}</strong> ({pendingDelete.email}) will no longer be able to log in.
            </p>
            <p className="text-sm text-gray-400 mb-5">Their quotations and history are preserved.</p>

            {deleteError && (
              <p className="text-sm text-red-600 mb-4">{deleteError}</p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                disabled={deleting}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={deleting}
                className="flex-1 bg-red-600 text-white py-2 px-4 rounded-lg text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleting ? "Deactivating…" : "Deactivate"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
