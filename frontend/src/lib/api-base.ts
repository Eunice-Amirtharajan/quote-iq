type Env = Readonly<Record<string, string | undefined>>;

const GRAPHQL_PATH = "/graphql";

/** Drops trailing slashes with a plain loop: a regex like /\/+$/ can backtrack on long input. */
function trimTrailingSlashes(url: string): string {
  let end = url.length;
  while (end > 0 && url[end - 1] === "/") end--;
  return url.slice(0, end);
}

/**
 * Base URL of the backend (no trailing slash), for the REST upload and the socket.io connection.
 * GraphQL, uploads and sockets must reach the same server, so this derives from VITE_API_URL
 * unless VITE_BACKEND_URL overrides it.
 */
export function apiBase(env: Env): string {
  if (env.VITE_BACKEND_URL) return trimTrailingSlashes(env.VITE_BACKEND_URL);
  const api = trimTrailingSlashes(env.VITE_API_URL ?? "http://localhost:4000/graphql");
  return trimTrailingSlashes(api.endsWith(GRAPHQL_PATH) ? api.slice(0, -GRAPHQL_PATH.length) : api);
}
