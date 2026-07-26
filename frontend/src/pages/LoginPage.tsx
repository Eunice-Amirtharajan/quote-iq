import { useState } from "react";
import { LOGIN_MUTATION } from "../graphql/mutations";
import { useAuth } from "../hooks/useAuth";
import { useMutation } from "@apollo/client/react";
import { client } from "../lib/apollo";
import type { Role } from "../context/auth-context";

interface LoginData {
  login: {
    id: string;
    name: string;
    email: string;
    role: Role;
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
      // Clear previous user's cached data before setting new user so
      // components never flash stale data from the prior session.
      client.resetStore().finally(() => setUser(data.login)).catch(() => setUser(data.login));
    },
    onError: (err) => {
      const isCredentials = err.message.toLowerCase().includes('invalid credentials');
      setError(isCredentials ? 'Invalid email or password.' : 'Unable to sign in. Please try again later.');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    login({ variables: { email, password } }).catch(() => {});
  };

  const loginAs = (demoEmail: string, demoPassword: string) => {
    setError("");
    setEmail(demoEmail);
    setPassword(demoPassword);
    login({ variables: { email: demoEmail, password: demoPassword } }).catch(() => {});
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
            <div className="mt-2">
              <p className="text-xs text-gray-400 text-center mb-2">or try a demo account</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => loginAs("marcus@quoteiq.com", "password123")}
                  disabled={loading}
                  className="px-3 py-2 text-xs font-medium border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Try as Manager
                </button>
                <button
                  type="button"
                  onClick={() => loginAs("anna@quoteiq.com", "password123")}
                  disabled={loading}
                  className="px-3 py-2 text-xs font-medium border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Try as Sales Rep
                </button>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
