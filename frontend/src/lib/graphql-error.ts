import { CombinedGraphQLErrors } from "@apollo/client/errors";

// Server messages written for users: validation (400) and "temporarily unavailable" (503).
// Anything else (500s, network errors) can carry internals, so it gets the fallback.
const USER_FACING_CODES = new Set(["BAD_REQUEST", "SERVICE_UNAVAILABLE"]);

/** The message to show for a failed GraphQL operation. */
export function userFacingMessage(error: unknown, fallback: string): string {
  if (CombinedGraphQLErrors.is(error)) {
    const shown = error.errors.find((e) =>
      USER_FACING_CODES.has(String(e.extensions?.["code"] ?? "")),
    );
    if (shown?.message) return shown.message;
  }
  return fallback;
}
