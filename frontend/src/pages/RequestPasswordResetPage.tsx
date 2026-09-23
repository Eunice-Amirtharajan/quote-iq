import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation } from "@apollo/client/react";
import { REQUEST_PASSWORD_RESET_MUTATION } from "../graphql/mutations";

export default function RequestPasswordResetPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  const [requestReset, { loading }] = useMutation(REQUEST_PASSWORD_RESET_MUTATION, {
    onCompleted: () => setSent(true),
    onError: () => setSent(true), // always show success to avoid email enumeration
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    requestReset({ variables: { email } }).catch(() => {});
  };

  if (sent) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 w-full max-w-md text-center">
          <div className="text-3xl mb-4">✉️</div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Check your email</h1>
          <p className="text-gray-500 text-sm mb-6">
            If that address is registered, you'll receive a reset link within a few minutes.
          </p>
          <Link
            to="/login"
            className="text-sm text-gray-600 hover:text-gray-900 underline"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 w-full max-w-md">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-gray-900">Reset your password</h1>
          <p className="text-gray-500 mt-1 text-sm">We'll send you a link to reset your password.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              placeholder="you@company.com"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gray-900 text-white py-2 px-4 rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Sending…" : "Send reset link"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-gray-500">
          <Link to="/login" className="text-gray-700 hover:text-gray-900 underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
