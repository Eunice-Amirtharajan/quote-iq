import { useState } from "react";
import { LOGIN_MUTATION } from "../graphql/mutations";
import { useAuth } from "../hooks/useAuth";
import { useMutation } from "@apollo/client/react";

interface LoginData {
  login: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const { setUser } = useAuth();
  const showDemo = import.meta.env.VITE_SHOW_DEMO_CREDENTIALS === "true";

  const [login, { loading }] = useMutation<LoginData>(LOGIN_MUTATION, {
    onCompleted: (data) => {
      setUser(data.login);
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    void login({ variables: { email, password } });
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 w-full max-w-md">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-gray-900">QuoteIQ</h1>
          <p className="text-gray-500 mt-1">Sign in to your account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              placeholder="you@company.com"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              placeholder="••••••••"
              required
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gray-900 text-white py-2 px-4 rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
          {showDemo && (
            <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-100">
              <p className="text-xs font-medium text-gray-500 mb-2">
                Demo credentials
              </p>
              <div className="space-y-1">
                <p className="text-xs text-gray-600">
                  <span className="font-medium">Manager:</span>{" "}
                  marcus@quoteiq.com
                </p>
                <p className="text-xs text-gray-600">
                  <span className="font-medium">Sales Rep:</span>{" "}
                  anna@quoteiq.com
                </p>
                <p className="text-xs text-gray-600">
                  <span className="font-medium">Password:</span> password123
                </p>
              </div>
            </div>
          )}
        </form>

        <p className="text-xs text-gray-400 mt-6 text-center"></p>
      </div>
    </div>
  );
}
