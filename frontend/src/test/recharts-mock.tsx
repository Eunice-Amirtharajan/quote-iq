import { cloneElement, type ReactElement } from "react";

/**
 * jsdom has no layout, so Recharts' ResponsiveContainer measures 0×0 and renders
 * nothing. Tests swap it for a fixed-size wrapper that passes explicit dimensions
 * to the chart. Use as:
 *   vi.mock("recharts", async (orig) => ({ ...(await orig()), ResponsiveContainer: FixedSizeContainer }));
 */
export function FixedSizeContainer({ children }: Readonly<{ children: ReactElement<{ width?: number; height?: number }> }>) {
  return <div style={{ width: 800, height: 400 }}>{cloneElement(children, { width: 800, height: 400 })}</div>;
}
