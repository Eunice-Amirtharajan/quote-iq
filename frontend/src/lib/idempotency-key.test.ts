import { afterEach, describe, expect, it, vi } from "vitest";
import { newIdempotencyKey } from "./idempotency-key";

describe("newIdempotencyKey", () => {
  afterEach(() => vi.restoreAllMocks());

  it("uses crypto.randomUUID when available", () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      "11111111-2222-4333-8444-555555555555",
    );
    expect(newIdempotencyKey()).toBe("11111111-2222-4333-8444-555555555555");
  });

  it("falls back to 128 random bits from getRandomValues outside a secure context", () => {
    const randomUUID = crypto.randomUUID;
    Object.defineProperty(crypto, "randomUUID", { value: undefined, configurable: true });
    try {
      const a = newIdempotencyKey();
      const b = newIdempotencyKey();
      expect(a).toMatch(/^[0-9a-f]{32}$/);
      expect(a).not.toBe(b);
    } finally {
      Object.defineProperty(crypto, "randomUUID", { value: randomUUID, configurable: true });
    }
  });

  it("never uses Math.random", () => {
    const mathRandom = vi.spyOn(Math, "random");
    newIdempotencyKey();
    expect(mathRandom).not.toHaveBeenCalled();
  });
});
