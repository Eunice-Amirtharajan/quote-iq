type Env = Readonly<Record<string, string | undefined>>;

/**
 * Base URL of the backend (no trailing slash), for the REST upload and the socket.io connection.
 * GraphQL, uploads and sockets must reach the same server, so this derives from VITE_API_URL
 * unless VITE_BACKEND_URL overrides it.
 */
export function apiBase(env: Env): string {
  const base =
    env.VITE_BACKEND_URL ||
    (env.VITE_API_URL ?? "http://localhost:4000/graphql").replace(/\/graphql\/?$/, "");
  return base.replace(/\/+$/, "");
}
