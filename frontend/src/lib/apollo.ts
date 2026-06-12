import { ApolloClient, InMemoryCache, HttpLink } from "@apollo/client";

if (import.meta.env.PROD === true && !import.meta.env.VITE_API_URL) {
  throw new Error(`Required property VITE_API_URL not found`);
}
const httpLink = new HttpLink({
  uri: import.meta.env.VITE_API_URL ?? "http://localhost:4000/graphql",
  credentials: "include",
});

export const client = new ApolloClient({
  link: httpLink,
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
