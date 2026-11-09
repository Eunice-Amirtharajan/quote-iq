import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { AuthContext } from "../context/auth-context";
import { useAuth } from "./useAuth";

describe("useAuth", () => {
  it("returns the Provider's value", () => {
    const value = { user: null, setUser: vi.fn() };
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
    );
    expect(renderHook(() => useAuth(), { wrapper }).result.current).toBe(value);
  });

  it("throws outside AuthProvider instead of looking logged out", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useAuth())).toThrow("useAuth must be used inside <AuthProvider>");
    vi.restoreAllMocks();
  });
});
