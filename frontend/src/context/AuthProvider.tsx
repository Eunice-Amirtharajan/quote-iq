import { useState, useMemo, useCallback, type ReactNode } from "react";
import { AuthContext, type User } from "./auth-context";
import { useQuery } from "@apollo/client/react";
import { ME_QUERY } from "../graphql/queries";
export type { User } from "./auth-context";

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [loggedOut, setLoggedOut] = useState(false);

  const { loading, data, error } = useQuery<{ me: User }>(ME_QUERY, {
    fetchPolicy: 'cache-and-network',
  });

  const user = loggedOut ? null : (data?.me ?? null);

  const setUser = useCallback((u: User | null) => {
    setLoggedOut(u === null);
  }, []);

  const value = useMemo(() => ({ user, setUser }), [user, setUser]);

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-sm text-gray-500">Could not connect. Please refresh.</p>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
