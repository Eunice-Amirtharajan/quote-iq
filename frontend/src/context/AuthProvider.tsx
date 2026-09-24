import { useState, useMemo, useCallback, type ReactNode } from "react";
import { AuthContext, type User } from "./auth-context";
import { useQuery } from "@apollo/client/react";
import { ME_QUERY } from "../graphql/queries";
export type { User } from "./auth-context";

const PUBLIC_PATH_RE = /^\/(invite|reset-password|login|view-quotation)(\/|$)/;

const isPublicPath = () =>
  typeof window !== 'undefined' && PUBLIC_PATH_RE.test(window.location.pathname);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [localUser, setLocalUser] = useState<User | null>(null);
  const [loggedOut, setLoggedOut] = useState(false);

  const { loading, data, error } = useQuery<{ me: User }>(ME_QUERY, {
    fetchPolicy: 'cache-and-network',
    errorPolicy: 'ignore',
    skip: isPublicPath(),
  });

  const user = loggedOut ? null : (localUser ?? data?.me ?? null);

  const setUser = useCallback((u: User | null) => {
    console.log('setUser called with:', u);
    setLocalUser(u);
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

  /* v8 ignore next 7 */
  if (error && !data) {
    // errorPolicy:'ignore' suppresses both GraphQL and network errors, so this
    // branch is only reachable if Apollo's internal error handling changes.
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
