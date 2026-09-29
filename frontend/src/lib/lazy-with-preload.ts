import { lazy, type ComponentType, type LazyExoticComponent } from "react";

// Same constraint as React.lazy itself: props are unknown to this wrapper
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PreloadableComponent<T extends ComponentType<any>> = LazyExoticComponent<T> & {
  /** Start downloading the chunk now; safe to call any number of times */
  preload: () => Promise<{ default: T }>;
};

/**
 * React.lazy plus a `preload()` that shares the same import promise.
 *
 * Route navigations run as transitions, so while a lazy route's chunk downloads React
 * keeps the *previous* screen on display. Preloading the likely next route (e.g. the
 * quotation detail page while the list is open) makes that navigation instant instead
 * of leaving the old page up in the meantime.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyWithPreload<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
): PreloadableComponent<T> {
  let pending: Promise<{ default: T }> | undefined;
  const load = () => {
    pending ??= factory().catch((error: unknown) => {
      pending = undefined; // let a later render or preload retry a failed download
      throw error;
    });
    return pending;
  };
  return Object.assign(lazy(load), { preload: load });
}
