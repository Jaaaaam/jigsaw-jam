import path from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  build: {
    rolldownOptions: {
      output: {
        // split the big stable vendors out of the app chunk: smaller pieces,
        // and app-code changes no longer bust the whole cached bundle
        codeSplitting: {
          groups: [
            { name: "react", test: /node_modules[\\/](react|react-dom|scheduler|react-router)/ },
            { name: "motion", test: /node_modules[\\/](framer-motion|motion-)/ },
            { name: "convex", test: /node_modules[\\/]convex/ },
            { name: "vendor", test: /node_modules/ },
          ],
        },
      },
    },
  },
  test: {
    // node by default; per-file overrides: happy-dom for browser-ish
    // services, edge-runtime for convex-test backend tests.
    environment: "node",
    include: ["tests/**/*.test.ts"],
    server: {
      deps: {
        inline: ["convex-test"],
      },
    },
  },
});
