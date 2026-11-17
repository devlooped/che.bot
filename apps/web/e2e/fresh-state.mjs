// Empties the state of the e2e server (its local D1, Durable Objects and files) before it starts, so
// every run of the suite begins from nothing. It lives apart from the state of `pnpm dev`
// (.wrangler/state): see E2E_STATE_DIR in vite.config.ts.
import { rmSync } from "node:fs";

rmSync(".wrangler/e2e-state", { recursive: true, force: true });
