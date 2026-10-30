import { describe, expect, it } from "vitest";
import { apiBase } from "./api-base";

describe("apiBase", () => {
  it("uses VITE_BACKEND_URL when it is set", () => {
    expect(
      apiBase({ VITE_BACKEND_URL: "https://ws.example.com", VITE_API_URL: "https://api.example.com/graphql" }),
    ).toBe("https://ws.example.com");
  });

  it("derives the server from VITE_API_URL otherwise", () => {
    expect(apiBase({ VITE_API_URL: "https://api.quoteiq.cc/graphql" })).toBe("https://api.quoteiq.cc");
    expect(apiBase({ VITE_API_URL: "http://localhost:4000/graphql/" })).toBe("http://localhost:4000");
  });

  it("only strips a trailing /graphql path, not 'graphql' in the host name", () => {
    expect(apiBase({ VITE_API_URL: "https://graphql.example.com/graphql" })).toBe("https://graphql.example.com");
  });

  it("drops a trailing slash so paths like /scores don't become //scores", () => {
    expect(apiBase({ VITE_BACKEND_URL: "https://api.quoteiq.cc/" })).toBe("https://api.quoteiq.cc");
  });

  it("defaults to the local backend on port 4000", () => {
    expect(apiBase({})).toBe("http://localhost:4000");
  });
});
