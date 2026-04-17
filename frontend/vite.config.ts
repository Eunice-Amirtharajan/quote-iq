import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    onUnhandledError(error) {
      if (error.message.includes("No more mocked responses")) return false;
      // return void to let Vitest handle other errors normally
    },
  },
});
