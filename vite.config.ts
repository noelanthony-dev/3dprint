/// <reference types="vitest" />
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  clearScreen: false,
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 1420,
    strictPort: true,
  },
  test: {
    globals: true,
    setupFiles: "./src/test/setup.ts",
  },
});
