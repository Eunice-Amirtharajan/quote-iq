// Recovery for lazy-loaded route chunks after a redeploy.
//
// Each build renames its chunks (content hashes). A tab opened before a deploy still
// references the old names; those files are gone, and vercel.json rewrites the miss to
// index.html, so the dynamic import fails. Vite reports that as `vite:preloadError`.
// Reloading once fetches the new index.html and its current chunk names.

const LAST_RELOAD_KEY = "quoteiq:chunk-reload-at";
/** A second failure within this window means the chunk is genuinely broken — don't loop */
const RELOAD_GUARD_MS = 10_000;

export function handleChunkLoadError(
  event: Event,
  reload: () => void = () => window.location.reload(),
  now: () => number = Date.now,
): void {
  let last = 0;
  try {
    last = Number(sessionStorage.getItem(LAST_RELOAD_KEY) ?? 0);
  } catch {
    // Storage unavailable (private mode, blocked) — fall through and reload once
  }
  if (now() - last < RELOAD_GUARD_MS) return; // let the error surface instead of looping

  try {
    sessionStorage.setItem(LAST_RELOAD_KEY, String(now()));
  } catch {
    // Without storage the guard can't persist; a reload is still the best recovery
  }
  event.preventDefault(); // stop Vite rethrowing — the reload replaces the page
  reload();
}

export function installChunkReload(): void {
  window.addEventListener("vite:preloadError", (event) => handleChunkLoadError(event));
}
