// The Worker of the local mode (`pnpm dev`, wrangler.local.jsonc): the production Worker with the
// outside world replaced. A scripted panel (scenario.ts) plays a full run in Spanish through the
// real protocol and the real RunObject; the classifier, the Gateway catalog, the jobs service and
// Auth0 are fakes. The production entry (src/worker/index.ts, wrangler.jsonc) never imports this
// folder, so no variable of a deployed Worker can switch it on; scripts/check-build.mjs checks the
// production build for LOCAL_MODE_MARKER.
import { CATALOG } from "@chebot/driver/testing";
import { FakeProvider } from "@chebot/providers";
import { handle } from "../worker/api.ts";
import { overrideDeps } from "../worker/deps.ts";
import type { Env } from "../worker/env.ts";
import { LOCAL_RUN_CONFIG } from "./config.ts";
import { localIdentity } from "./identity.ts";
import { localJobs } from "./jobs.ts";
import { LOCAL_MODE_MARKER } from "./marker.ts";
import { scenario } from "./scenario.ts";

export { RunObject } from "../worker/run-object.ts";
export { SpendMeter } from "../worker/spend-meter.ts";

/** A question up to this long counts as simple (5,000 ARS), a longer one as complex. */
const SIMPLE_UP_TO_CHARS = 80;

// Set when the module loads, so that a Durable Object woken by its alarm after a restart of the
// dev server sees the fakes too (the Worker and its objects share this isolate in local dev).
overrideDeps({
  provider: () => new FakeProvider(scenario()),
  catalog: async () => CATALOG,
  classifier: () => ({
    async classify(req) {
      const simple = req.question.length <= SIMPLE_UP_TO_CHARS;
      return {
        class: simple ? "simple" : "complex",
        choice: simple ? "simple" : "complex",
        probability: 0.9,
        usage: { inputTokens: 10, outputTokens: 1 },
        costUsd: 0.001,
        latencyMs: 200,
      };
    },
  }),
  jobs: (env) => localJobs(env),
  identify: localIdentity,
  runConfig: () => LOCAL_RUN_CONFIG,
  tickDelayMs: 400,
});

const migrations = import.meta.glob<string>("../../migrations/*.sql", {
  query: "?raw",
  import: "default",
  eager: true,
});

let schemaReady: Promise<void> | null = null;

/** Applies the D1 migrations to the local database once, when it has none of their tables. */
function ensureSchema(db: D1Database): Promise<void> {
  schemaReady ??= (async () => {
    const found = await db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'prices'")
      .first();
    if (found) return;
    for (const name of Object.keys(migrations).sort()) {
      const statements = (migrations[name] ?? "")
        .replace(/--.*$/gm, "")
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean);
      await db.batch(statements.map((sql) => db.prepare(sql)));
    }
  })().catch((error: unknown) => {
    schemaReady = null;
    throw error;
  });
  return schemaReady;
}

const PAY_PATH = /^\/api\/local\/pay\/([0-9a-f-]{36})$/i;

export default {
  async fetch(request, env) {
    await ensureSchema(env.DB);
    const url = new URL(request.url);
    if (url.pathname === "/api/local") return Response.json({ mode: LOCAL_MODE_MARKER });
    // Plays the user paying the QR of a run: the fake jobs service calls the run's hook.
    const pay = PAY_PATH.exec(url.pathname);
    if (pay?.[1] && request.method === "POST")
      return localJobs(env).pay(pay[1].toLowerCase(), (hook) => handle(hook, env));
    return handle(request, env);
  },
} satisfies ExportedHandler<Env>;
