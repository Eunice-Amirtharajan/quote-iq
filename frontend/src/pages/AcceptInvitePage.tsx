import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useMutation } from "@apollo/client/react";
import { ACCEPT_INVITE_MUTATION } from "../graphql/mutations";
import { useAuth } from "../hooks/useAuth";
import { client } from "../lib/apollo";

export default function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const [acceptInvite, { loading }] = useMutation(ACCEPT_INVITE_MUTATION, {
    onCompleted: () => {
      // Backend cleared the cookie — mirror that in the frontend
      client.clearStore().finally(() => setUser(null)).catch(() => setUser(null));
      setDone(true);
    },
    onError: (err) => setError(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    acceptInvite({ variables: { token, password } }).catch(() => {});
  };

  if (done) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 w-full max-w-md text-center">
          <div className="text-3xl mb-4">✓</div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Password set</h1>
          <p className="text-gray-500 text-sm mb-6">Your account is ready. Sign in to get started.</p>
          <button
            onClick={() => navigate("/login")}
            className="w-full bg-gray-900 text-white py-2 px-4 rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors"
          >
            Go to sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 w-full max-w-md">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-gray-900">Set your password</h1>
          <p className="text-gray-500 mt-1 text-sm">Choose a password to activate your QuoteIQ account.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              placeholder="Min. 8 characters"
              required
              minLength={8}
            />
          </div>

          <div>
            <label htmlFor="confirm" className="block text-sm font-medium text-gray-700 mb-1">
              Confirm password
            </label>
            <input
              id="confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              placeholder="Re-enter password"
              required
            />
          </div>

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gray-900 text-white py-2 px-4 rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Setting password…" : "Set password"}
          </button>
        </form>
      </div>
    </div>
  );
}
