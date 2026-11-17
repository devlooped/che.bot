import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// One Worker serves the API, the Durable Objects and the built single-page app (see wrangler.jsonc).
// `--mode fakes` (pnpm dev) runs the Worker of the local mode instead (wrangler.local.jsonc,
// src/local/worker.ts: every outside service is a fake); any other mode, the build included, uses
// wrangler.jsonc, whose entry never imports src/local. The local state (D1, Durable Objects) lives
// in .wrangler/state; the end-to-end tests set E2E_STATE_DIR to keep theirs apart (playwright.config.ts).
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    cloudflare({
      ...(mode === "fakes" ? { configPath: "./wrangler.local.jsonc" } : {}),
      ...(process.env.E2E_STATE_DIR ? { persistState: { path: process.env.E2E_STATE_DIR } } : {}),
    }),
  ],
}));
