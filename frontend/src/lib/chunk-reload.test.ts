import { vi } from "vitest";
import { handleChunkLoadError, installChunkReload } from "./chunk-reload";

const KEY = "quoteiq:chunk-reload-at";

describe("handleChunkLoadError", () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("reloads once and suppresses the error", () => {
    const event = new Event("vite:preloadError", { cancelable: true });
    const reload = vi.fn();

    handleChunkLoadError(event, reload, () => 50_000);

    expect(reload).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
    expect(sessionStorage.getItem(KEY)).toBe("50000");
  });

  it("does not reload again within the guard window, letting the error surface", () => {
    sessionStorage.setItem(KEY, "50000");
    const event = new Event("vite:preloadError", { cancelable: true });
    const reload = vi.fn();

    handleChunkLoadError(event, reload, () => 55_000);

    expect(reload).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("recovers again once the guard window has passed — e.g. the next deploy", () => {
    sessionStorage.setItem(KEY, "50000");
    const reload = vi.fn();

    handleChunkLoadError(new Event("vite:preloadError", { cancelable: true }), reload, () => 70_000);

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("still reloads when sessionStorage is unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const reload = vi.fn();

    handleChunkLoadError(new Event("vite:preloadError", { cancelable: true }), reload, () => 50_000);

    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe("installChunkReload", () => {
  it("listens for Vite's preload error event", () => {
    const add = vi.spyOn(window, "addEventListener");
    installChunkReload();
    expect(add).toHaveBeenCalledWith("vite:preloadError", expect.any(Function));
    add.mockRestore();
  });
});
