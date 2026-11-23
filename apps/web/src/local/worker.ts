// The Worker of the local mode (`pnpm dev`, wrangler.local.jsonc): the production Worker with the
// outside world replaced. A scripted panel (scenario.ts) plays a full run in Spanish through the
// real protocol and the real RunObject; the classifier, the Gateway catalog, the jobs service and
// Auth0 are fakes. The fake sign-in sets the same session cookie as the real one
// (POST /api/local/sign-in), so the rest of the Worker reads it as in production. The production
// entry (src/worker/index.ts, wrangler.jsonc) never imports this folder, so no variable of a
// deployed Worker can switch it on; scripts/check-build.mjs checks the production build for
// LOCAL_MODE_MARKER.
import { FakeProvider } from "@chebot/providers";
import { handle } from "../worker/api.ts";
import { overrideDeps } from "../worker/deps.ts";
import type { Env } from "../worker/env.ts";
import { PAYMENT_WINDOW_MS, RunObject as ProductionRunObject } from "../worker/run-object.ts";
import {
  clearLoginCookie,
  clearSessionCookie,
  fromThisOrigin,
  sessionCookie,
} from "../worker/session.ts";
import { LOCAL_CATALOG } from "./catalog.ts";
import { LOCAL_RUN_CONFIG } from "./config.ts";
import { localImages } from "./images.ts";
import { localJobs } from "./jobs.ts";
import { LOCAL_MODE_MARKER } from "./marker.ts";
import { scenario } from "./scenario.ts";

export { SpendMeter } from "../worker/spend-meter.ts";

/**
 * The run object of the production Worker, with one addition of the local mode: `expireNow` plays
 * the 15 minutes of the payment window passing (POST /api/local/expire/:id). It moves the start of
 * the window back and wakes the alarm; the production code then expires the run and cancels its
 * job, as it would after a real wait.
 */
export class RunObject extends ProductionRunObject {
  async expireNow(): Promise<boolean> {
    const rows = this.ctx.storage.sql
      .exec<{ status: string }>("SELECT status FROM run LIMIT 1")
      .toArray();
    if (rows[0]?.status !== "awaiting_payment") return false;
    this.ctx.storage.sql.exec(
      "UPDATE run SET pay_requested_at = ?",
      Date.now() - PAYMENT_WINDOW_MS - 1,
    );
    await this.ctx.storage.setAlarm(Date.now());
    return true;
  }
}

/** A question up to this long counts as simple (5,000 ARS), a longer one as complex. */
const SIMPLE_UP_TO_CHARS = 80;

// Set when the module loads, so that a Durable Object woken by its alarm after a restart of the
// dev server sees the fakes too (the Worker and its objects share this isolate in local dev).
overrideDeps({
  provider: () => new FakeProvider(scenario()),
  images: () => localImages,
  catalog: async () => LOCAL_CATALOG,
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
  runConfig: () => LOCAL_RUN_CONFIG,
  tickDelayMs: 400,
});

const migrations = import.meta.glob<string>("../../migrations/*.sql", {
  query: "?raw",
  import: "default",
  eager: true,
});

let schemaReady: Promise<void> | null = null;

/**
 * Applies the D1 migrations the local database has not had, once per start, and records each in
 * local_migrations. A database made before that table has the first migration's tables: it counts
 * as applied.
 */
function ensureSchema(db: D1Database): Promise<void> {
  schemaReady ??= (async () => {
    await db.prepare("CREATE TABLE IF NOT EXISTS local_migrations (name TEXT PRIMARY KEY)").run();
    const { results } = await db
      .prepare("SELECT name FROM local_migrations")
      .all<{ name: string }>();
    const applied = new Set(results.map((row) => row.name));
    const names = Object.keys(migrations).sort();
    if (!applied.size && names[0]) {
      const found = await db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'prices'")
        .first();
      if (found) {
        await db.prepare("INSERT INTO local_migrations (name) VALUES (?)").bind(names[0]).run();
        applied.add(names[0]);
      }
    }
    for (const name of names) {
      if (applied.has(name)) continue;
      const statements = (migrations[name] ?? "")
        .replace(/--.*$/gm, "")
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean);
      await db.batch([
        ...statements.map((sql) => db.prepare(sql)),
        db.prepare("INSERT INTO local_migrations (name) VALUES (?)").bind(name),
      ]);
    }
  })().catch((error: unknown) => {
    schemaReady = null;
    throw error;
  });
  return schemaReady;
}

/** POST /api/local/sign-in `{ id, name, roles }`: the session of a test user, without Auth0. */
async function signIn(request: Request, env: Env): Promise<Response> {
  const body = (await request.json().catch(() => null)) as {
    id?: unknown;
    name?: unknown;
    roles?: unknown;
  } | null;
  const roles = Array.isArray(body?.roles) ? body.roles : [];
  if (
    typeof body?.id !== "string" ||
    !body.id ||
    typeof body.name !== "string" ||
    !roles.every((r): r is string => typeof r === "string")
  )
    return new Response("The body is { id, name, roles }.", { status: 400 });
  const url = new URL(request.url);
  const user = { userId: body.id, name: body.name || body.id, roles };
  return new Response(null, {
    status: 204,
    headers: { "set-cookie": await sessionCookie(url, env, user) },
  });
}

const PAY_PATH = /^\/api\/local\/pay\/([0-9a-f-]{36})$/i;
const EXPIRE_PATH = /^\/api\/local\/expire\/([0-9a-f-]{36})$/i;

export default {
  async fetch(request, env) {
    await ensureSchema(env.DB);
    const url = new URL(request.url);
    if (url.pathname === "/api/local") return Response.json({ mode: LOCAL_MODE_MARKER });
    // There is no tenant: signing out only clears the session.
    if (url.pathname === "/auth/logout") {
      const headers = new Headers({ location: "/" });
      headers.append("set-cookie", clearSessionCookie(url));
      headers.append("set-cookie", clearLoginCookie(url));
      return new Response(null, { status: 302, headers });
    }
    if (url.pathname.startsWith("/auth/"))
      return new Response("The local mode signs in with POST /api/local/sign-in.", { status: 404 });
    if (url.pathname.startsWith("/api/local/") && !fromThisOrigin(request))
      return new Response("This request does not come from this site.", { status: 403 });
    if (url.pathname === "/api/local/sign-in" && request.method === "POST")
      return signIn(request, env);
    // Plays the user paying the QR of a run: the fake jobs service calls the run's hook.
    const pay = PAY_PATH.exec(url.pathname);
    if (pay?.[1] && request.method === "POST")
      return localJobs(env).pay(pay[1].toLowerCase(), (hook) => handle(hook, env));
    // Plays the payment window of a run passing: the run expires and its QR is cancelled.
    const expire = EXPIRE_PATH.exec(url.pathname);
    if (expire?.[1] && request.method === "POST") {
      const id = expire[1].toLowerCase();
      const stub = env.RUNS.get(env.RUNS.idFromName(id)) as unknown as DurableObjectStub<RunObject>;
      return (await stub.expireNow())
        ? new Response(null, { status: 202 })
        : new Response("Not waiting for payment.", { status: 409 });
    }
    return handle(request, env);
  },
} satisfies ExportedHandler<Env>;
