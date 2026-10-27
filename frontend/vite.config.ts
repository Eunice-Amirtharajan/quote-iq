import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    exclude: ["**/node_modules/**", "**/e2e/**"],
    // Headroom for slow runs (pre-commit hook with dev servers open): findBy* waits up to 5s
    // (src/test/setup.ts), and some tests wait several times
    testTimeout: 20000,
    // Half the CPUs: ~10% slower when idle, but a third less CPU in total, so a busy machine
    // doesn't starve the workers into timeouts (one jsdom per worker)
    maxWorkers: "50%",
    onUnhandledError(error) {
      if (error.message.includes("No more mocked responses")) return false;
      // return void to let Vitest handle other errors normally
    },
  },
});
