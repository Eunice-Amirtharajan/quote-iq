import { ApolloClient, InMemoryCache, HttpLink, from } from "@apollo/client";
import { CombinedGraphQLErrors } from "@apollo/client/errors";
import { onError } from "@apollo/client/link/error";

if (import.meta.env.PROD === true && !import.meta.env.VITE_API_URL) {
  throw new Error(`Required property VITE_API_URL not found`);
}

const httpLink = new HttpLink({
  uri: import.meta.env.VITE_API_URL ?? "http://localhost:4000/graphql",
  credentials: "include",
  headers: { "Apollo-Require-Preflight": "1" },
});

// Intercept UNAUTHENTICATED errors globally — clears cache and redirects to login.
// Covers deactivated users, expired tokens, and any other 401 scenario.
const authErrorLink = onError(({ error }) => {
  if (CombinedGraphQLErrors.is(error)) {
    const isUnauth = error.errors.some((e) => e.extensions?.["code"] === "UNAUTHENTICATED");
    if (isUnauth) {
      client.clearStore().finally(() => {
        window.location.href = "/login";
      }).catch(() => {
        window.location.href = "/login";
      });
    }
  }
});

export const client = new ApolloClient({
  link: from([authErrorLink, httpLink]),
  cache: new InMemoryCache({
    typePolicies: {
      // DashboardStatsType has no id field — store as a root singleton
      DashboardStatsType: { keyFields: false },
      Query: {
        fields: {
          // Merge paginated quotation pages so fetchMore appends instead of
          // replacing. keyArgs lists the variables that identify a distinct
          // list — filter changes reset the list; take/skip are pagination
          // cursors and must NOT be key args.
          quotations: {
            keyArgs: ["filter"],
            merge(existing: unknown[] | undefined, incoming: unknown[]) {
              return [...(existing ?? []), ...incoming];
            },
          },
        },
      },
    },
  }),
});
