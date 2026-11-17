import { defineConfig, devices } from "@playwright/test";
import { BASE_URL, PORT } from "./e2e/base-url.ts";

// End-to-end tests against the local mode (`pnpm dev`: the real Worker, RunObject and protocol,
// with a scripted panel, a fake jobs service and a fake sign-in). Run with `pnpm test:e2e`; they
// need a browser: `pnpm exec playwright install chromium` once, or PLAYWRIGHT_CHANNEL=msedge (or
// chrome) to use one installed on the machine. The server keeps its state (D1, Durable Objects) in
// .wrangler/e2e-state, emptied at each start, apart from the state of `pnpm dev`.

const channel = process.env.PLAYWRIGHT_CHANNEL || undefined;
const browser = channel ? { channel } : {};

export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  workers: 4,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    locale: "es-AR",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "phone", use: { ...devices["Pixel 7"], ...browser } },
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 860 }, ...browser },
    },
  ],
  webServer: {
    command: `node e2e/fresh-state.mjs && pnpm dev --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/api/local`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { WRANGLER_SEND_METRICS: "false", E2E_STATE_DIR: ".wrangler/e2e-state" },
  },
});
