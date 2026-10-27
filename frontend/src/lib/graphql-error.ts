import { CombinedGraphQLErrors } from "@apollo/client/errors";
import type { GraphQLFormattedError } from "graphql";

// Server messages written for users: validation (400), "too many requests / today's AI limit"
// (429) and "temporarily unavailable" (503). Anything else (500s, network errors) can carry
// internals, so it gets the fallback.
const USER_FACING_STATUSES = new Set([400, 429, 503]);

// The backend (Nest + Apollo) names only some statuses: 400 arrives as code BAD_REQUEST, while
// every other HTTP error arrives as code INTERNAL_SERVER_ERROR with the real status in
// extensions.status. So a real 500 has no status, and a 429 or 503 does.
function httpStatus(error: GraphQLFormattedError): number | undefined {
  const status = error.extensions?.["status"];
  if (typeof status === "number") return status;
  return error.extensions?.["code"] === "BAD_REQUEST" ? 400 : undefined;
}

/** The message to show for a failed GraphQL operation. */
export function userFacingMessage(error: unknown, fallback: string): string {
  if (CombinedGraphQLErrors.is(error)) {
    const shown = error.errors.find((e) => {
      const status = httpStatus(e);
      return status !== undefined && USER_FACING_STATUSES.has(status);
    });
    if (shown?.message) return shown.message;
  }
  return fallback;
}
