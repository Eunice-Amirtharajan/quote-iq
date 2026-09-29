import { Suspense } from "react";
import { render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { lazyWithPreload } from "./lazy-with-preload";

const Page = () => <p>loaded page</p>;

describe("lazyWithPreload", () => {
  it("downloads the chunk once, shared between preload and render", async () => {
    const factory = vi.fn(() => Promise.resolve({ default: Page }));
    const LazyPage = lazyWithPreload(factory);

    await LazyPage.preload();
    await LazyPage.preload();
    render(
      <Suspense fallback={<p>loading</p>}>
        <LazyPage />
      </Suspense>,
    );

    expect(await screen.findByText("loaded page")).toBeInTheDocument();
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("renders like React.lazy when never preloaded", async () => {
    const LazyPage = lazyWithPreload(() => Promise.resolve({ default: Page }));
    render(
      <Suspense fallback={<p>loading</p>}>
        <LazyPage />
      </Suspense>,
    );
    expect(await screen.findByText("loaded page")).toBeInTheDocument();
  });

  it("retries after a failed download instead of caching the failure", async () => {
    const factory = vi
      .fn<() => Promise<{ default: typeof Page }>>()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({ default: Page });
    const LazyPage = lazyWithPreload(factory);

    await expect(LazyPage.preload()).rejects.toThrow("network");
    await expect(LazyPage.preload()).resolves.toEqual({ default: Page });
    expect(factory).toHaveBeenCalledTimes(2);
  });
});
