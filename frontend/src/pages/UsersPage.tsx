import { useState } from "react";
import { useQuery, useMutation } from "@apollo/client/react";
import { USERS_QUERY } from "../graphql/queries";
import { INVITE_USER_MUTATION } from "../graphql/mutations";

type Role = "SALES_MANAGER" | "SALES_REP";

interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: string;
}

function roleBadge(role: Role) {
  const base = "inline-block px-2 py-0.5 rounded text-xs font-medium";
  return role === "SALES_MANAGER"
    ? `${base} bg-gray-900 text-white`
    : `${base} bg-gray-100 text-gray-700`;
}

export default function UsersPage() {
  const { data, loading, refetch } = useQuery<{ users: User[] }>(USERS_QUERY);

  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("SALES_REP");
  const [formError, setFormError] = useState("");
  const [inviteSent, setInviteSent] = useState(false);

  const [inviteUser, { loading: inviting }] = useMutation(INVITE_USER_MUTATION, {
    onCompleted: () => {
      setInviteSent(true);
      refetch().catch(() => {});
    },
    onError: (err) => setFormError(err.message),
  });

  const openModal = () => {
    setName(""); setEmail(""); setRole("SALES_REP");
    setFormError(""); setInviteSent(false);
    setShowModal(true);
  };

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    inviteUser({ variables: { name, email, role } }).catch(() => {});
  };

  const closeModal = () => setShowModal(false);

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Users</h1>
        <button
          type="button"
          onClick={openModal}
          className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors"
        >
          Invite user
        </button>
      </div>

      {loading && <p className="text-sm text-gray-400">Loading…</p>}

      {!loading && data && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left">
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Name</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Email</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Role</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Joined</th>
              </tr>
            </thead>
            <tbody>
              {data.users.map((u) => (
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={closeModal}
            aria-hidden="true"
          />
          <div className="relative bg-white rounded-2xl shadow-lg border border-gray-100 p-6 w-full max-w-sm">
            {inviteSent ? (
              <div className="text-center py-4">
                <div className="text-3xl mb-3">✉️</div>
                <h2 className="text-lg font-semibold text-gray-900 mb-1">Invite sent</h2>
                <p className="text-sm text-gray-500 mb-5">
                  An invitation email has been sent to <strong>{email}</strong>.
                </p>
                <button
                  type="button"
                  onClick={closeModal}
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
                      onChange={(e) => setName(e.target.value)}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                      placeholder="Jane Smith"
                    />
                  </div>
                  <div>
                    <label htmlFor="inv-email" className="block text-xs font-medium text-gray-700 mb-1">Email</label>
                    <input
                      id="inv-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                      placeholder="jane@company.com"
                    />
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
                    <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{formError}</p>
                  )}

                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={closeModal}
                      className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={inviting}
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
    </div>
  );
}
