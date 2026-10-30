import { describe, expect, it } from "vitest";
import { backendUrl } from "./useScoreSocket";

describe("backendUrl", () => {
  it("uses VITE_BACKEND_URL when it is set", () => {
    expect(
      backendUrl({ VITE_BACKEND_URL: "https://ws.example.com", VITE_API_URL: "https://api.example.com/graphql" }),
    ).toBe("https://ws.example.com");
  });

  it("derives the server from VITE_API_URL otherwise", () => {
    expect(backendUrl({ VITE_API_URL: "https://api.quoteiq.cc/graphql" })).toBe("https://api.quoteiq.cc");
    expect(backendUrl({ VITE_API_URL: "http://localhost:4000/graphql/" })).toBe("http://localhost:4000");
  });

  it("defaults to the local backend on port 4000", () => {
    expect(backendUrl({})).toBe("http://localhost:4000");
  });
});
