import "@testing-library/jest-dom";
import { configure } from "@testing-library/react";

// findBy*/waitFor give up after 1s by default. A loaded run (CI, or the pre-commit hook running
// all 35 files in parallel) can take longer than that to commit a Suspense reveal or an Apollo
// mock response, so tests that pass alone flake together. Failing tests still fail, just later.
configure({ asyncUtilTimeout: 5_000 });

globalThis.addEventListener('unhandledrejection', (event) => {
  event.preventDefault();
});
