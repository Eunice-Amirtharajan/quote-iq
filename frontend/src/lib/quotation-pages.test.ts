import { describe, expect, it } from "vitest";
import { mergeQuotationPages } from "./quotation-pages";

const ref = (id: string) => ({ __ref: `QuotationType:${id}` });

describe("mergeQuotationPages", () => {
  it("replaces the list with a first page (no cursor), so a refetch doesn't duplicate rows", () => {
    expect(mergeQuotationPages([ref("a"), ref("b")], [ref("a"), ref("b")], { args: { take: 20 } })).toEqual([
      ref("a"),
      ref("b"),
    ]);
  });

  it("appends a page fetched with a cursor", () => {
    expect(
      mergeQuotationPages([ref("a"), ref("b")], [ref("c")], { args: { after: { id: "b" } } }),
    ).toEqual([ref("a"), ref("b"), ref("c")]);
  });

  it("skips rows that are already in the list", () => {
    expect(
      mergeQuotationPages([ref("a"), ref("b")], [ref("b"), ref("c")], { args: { after: { id: "a" } } }),
    ).toEqual([ref("a"), ref("b"), ref("c")]);
  });

  it("starts a new list when there is nothing to append to", () => {
    expect(mergeQuotationPages(undefined, [ref("a")], { args: { after: { id: "x" } } })).toEqual([ref("a")]);
    expect(mergeQuotationPages(undefined, [ref("a")], { args: null })).toEqual([ref("a")]);
  });
});
