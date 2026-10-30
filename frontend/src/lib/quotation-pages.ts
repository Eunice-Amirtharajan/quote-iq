type Ref = { __ref?: string };

/**
 * Apollo merge for the paginated quotations list. A request without a cursor is a first page (the
 * initial load, a refetch after creating a quote): it replaces the list. Appending it, as the old
 * merge did, showed the first page twice after every refetch. A request with `after` is
 * "Load more": it appends, skipping any row already in the list.
 */
export function mergeQuotationPages<T extends Ref>(
  existing: readonly T[] | undefined,
  incoming: readonly T[],
  { args }: { args: Record<string, unknown> | null },
): T[] {
  if (!args?.after || !existing) return [...incoming];
  const seen = new Set(existing.map((row) => row.__ref));
  return [...existing, ...incoming.filter((row) => !row.__ref || !seen.has(row.__ref))];
}
