import { resolveConfig } from "@chebot/protocol";
import { readModels, updateModels, updatePrices } from "./admin.ts";
import { deps } from "./deps.ts";
import type { Env } from "./env.ts";
import { type Identity, isAdmin, mayAsk, type User } from "./identity.ts";
import { questionOf, quoteQuestion } from "./quote.ts";
import { runStub } from "./run-object.ts";
import { listRuns, readPrices } from "./settings.ts";
import { spendMeter } from "./spend-meter.ts";

// The HTTP API. Who may call each route:
//
//   POST   /api/runs                  signed in, admin or beta role until launch: the quote
//   POST   /api/runs/:id/pay          the owner (an admin owner runs free, with no job)
//   POST   /api/runs/:id/rerun        the owner, after a paid run failed
//   DELETE /api/runs/:id              the owner or an admin
//   GET    /api/runs/:id[/events|/ws|/snapshots/:v]   anyone with the link
//   GET    /api/me/runs               signed in
//   GET|PUT /api/admin/models|prices  admin
//   POST   /api/pay/hook              the jobs service, with the token of the run as Bearer
//
// The caller's identity is resolved once per request (deps.identify, the Auth0 check); a request
// with a token that is not valid answers 401 on every route, the public ones included.

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

const error = (status: number, message: string, extra: Record<string, unknown> = {}) =>
  json(status, { error: message, ...extra });

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const UUID_ONLY = new RegExp(`^${UUID}$`, "i");
const RUN_PATH = new RegExp(
  `^/api/runs/(${UUID})(/events|/ws|/pay|/rerun|/snapshots/(\\d+))?$`,
  "i",
);

/** The largest JSON body read, in bytes: a question is at most 2,000 characters. */
const MAX_BODY_BYTES = 32_768;

/** A user, or 401. */
function requireUser(identity: Identity): User | Response {
  return identity.kind === "user" ? identity : error(401, "Sign in first.");
}

/** An admin, or 401 or 403. */
function requireAdmin(identity: Identity): User | Response {
  const user = requireUser(identity);
  if (user instanceof Response) return user;
  return isAdmin(user) ? user : error(403, "Only an admin may.");
}

/** A sequence number of the query, or null when it is not one. */
function afterOf(url: URL): number | null {
  const raw = url.searchParams.get("after") ?? "0";
  const after = Number(raw);
  return /^\d+$/.test(raw) && Number.isSafeInteger(after) ? after : null;
}

/** The JSON body of a request, or a 400 or 413 response. */
async function bodyOf(request: Request): Promise<{ body: unknown } | Response> {
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES)
    return error(413, "The request is too large.");
  try {
    return { body: JSON.parse(text) as unknown };
  } catch {
    return error(400, "The body is not JSON.");
  }
}

/**
 * POST /api/runs, the guardrails in order, cheapest first and before any model call: signed in;
 * the admin or beta role until launch; the rate limit of the user; the question and its length;
 * room under the daily cap for the worst case of a run. Then the quote: classify, price, create.
 */
async function ask(request: Request, env: Env, identity: Identity): Promise<Response> {
  const user = requireUser(identity);
  if (user instanceof Response) return user;
  if (!mayAsk(user, env)) return error(403, "Asking is open to the beta for now.");
  if (!(await env.ASK_LIMITER.limit({ key: user.userId })).success)
    return error(429, "Too many questions in a row. Wait a minute.");
  const read = await bodyOf(request);
  if (read instanceof Response) return read;
  const parsed = questionOf(read.body);
  if ("error" in parsed) return error(400, parsed.error);
  const meter = spendMeter(env);
  const budget = resolveConfig(deps.runConfig(env)).budgetUsd;
  if (!(await meter.status(budget)).open)
    return error(503, "The daily limit was reached. Try again tomorrow.", {
      reason: "daily_cap",
    });
  const quote = await quoteQuestion(env, user.userId, parsed.question);
  if (quote.costUsd > 0)
    await meter.settle(`${quote.runId}:classify`, quote.costUsd).catch((e: unknown) => {
      console.warn("The cost of a classification could not be recorded.", e);
    });
  return json(201, {
    runId: quote.runId,
    class: quote.class,
    amount: quote.amount,
    currency: quote.currency,
  });
}

/** POST /api/pay/hook: `{ id }` of the jobs service's webhook, `Authorization: Bearer <run token>`. */
async function payHook(request: Request, env: Env): Promise<Response> {
  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization")?.trim() ?? "")?.[1];
  if (!token) return error(401, "A bearer token is required.");
  const read = await bodyOf(request);
  if (read instanceof Response) return read;
  const runId = (read.body as { id?: unknown } | null)?.id;
  if (typeof runId !== "string" || !UUID_ONLY.test(runId))
    return error(400, "The body carries the id of the job.");
  const result = await runStub(env, runId).hook(token);
  if (result === "ok") return json(200, { ok: true });
  if (result === "not_found") return error(404, "No such run.");
  if (result === "forbidden") return error(403, "Forbidden.");
  return error(409, "This run is not waiting for payment.");
}

export async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/")) return error(404, "Not found.");
  const method = request.method;

  // Called by the jobs service, with the token of the run instead of an Auth0 token.
  if (url.pathname === "/api/pay/hook") {
    if (method !== "POST") return error(405, "Method not allowed.");
    return payHook(request, env);
  }

  let identity: Identity;
  try {
    identity = await deps.identify(request, env);
  } catch {
    return error(401, "The access token is not valid.");
  }

  if (url.pathname === "/api/runs") {
    if (method !== "POST") return error(405, "Method not allowed.");
    return ask(request, env, identity);
  }

  if (url.pathname === "/api/me/runs") {
    if (method !== "GET") return error(405, "Method not allowed.");
    const user = requireUser(identity);
    if (user instanceof Response) return user;
    return json(200, { runs: await listRuns(env.DB, user.userId) });
  }

  if (url.pathname === "/api/admin/models" || url.pathname === "/api/admin/prices") {
    const admin = requireAdmin(identity);
    if (admin instanceof Response) return admin;
    const models = url.pathname === "/api/admin/models";
    if (method === "GET")
      return json(200, models ? await readModels(env) : { prices: await readPrices(env.DB) });
    if (method !== "PUT") return error(405, "Method not allowed.");
    const read = await bodyOf(request);
    if (read instanceof Response) return read;
    const result = models
      ? await updateModels(env, read.body, admin.userId)
      : await updatePrices(env, read.body);
    return result.ok
      ? json(200, result.value)
      : error(400, "Some values are not valid.", { errors: result.errors });
  }

  const match = RUN_PATH.exec(url.pathname);
  if (!match?.[1]) return error(404, "Not found.");
  const id = match[1].toLowerCase();
  const sub = match[2] ?? "";
  const stub = runStub(env, id);

  if (sub === "") {
    if (method === "GET") {
      const summary = await stub.summary();
      return summary ? json(200, summary) : error(404, "No such run.");
    }
    if (method === "DELETE") {
      const user = requireUser(identity);
      if (user instanceof Response) return user;
      const owner = await stub.owner();
      if (owner === null) return error(404, "No such run.");
      if (owner !== user.userId && !isAdmin(user)) return error(403, "Not your run.");
      return (await stub.remove())
        ? new Response(null, { status: 204 })
        : error(404, "No such run.");
    }
    return error(405, "Method not allowed.");
  }

  if (sub === "/pay") {
    if (method !== "POST") return error(405, "Method not allowed.");
    const user = requireUser(identity);
    if (user instanceof Response) return user;
    const owner = await stub.owner();
    if (owner === null) return error(404, "No such run.");
    if (owner !== user.userId) return error(403, "Not your run.");
    // The hook goes back to the host this request reached: on Cloudflare that is a hostname
    // routed to this Worker (workers.dev, a preview or a custom domain), whatever the deployment.
    const result = await stub.pay({
      hookUrl: new URL("/api/pay/hook", url.origin).href,
      free: isAdmin(user),
    });
    if (result.ok) return json(202, result.summary);
    return result.reason === "not_found"
      ? error(404, "No such run.")
      : error(503, "The daily limit was reached. Try again tomorrow.", { reason: "daily_cap" });
  }

  if (sub === "/rerun") {
    if (method !== "POST") return error(405, "Method not allowed.");
    const user = requireUser(identity);
    if (user instanceof Response) return user;
    const owner = await stub.owner();
    if (owner === null) return error(404, "No such run.");
    if (owner !== user.userId) return error(403, "Not your run.");
    const result = await stub.rerun();
    if (result.ok) return json(202, result.summary);
    return result.reason === "not_found"
      ? error(404, "No such run.")
      : json(409, { error: "This run cannot run again.", reason: result.reason });
  }

  if (method !== "GET") return error(405, "Method not allowed.");

  if (sub === "/events") {
    const after = afterOf(url);
    if (after === null) return error(400, "after is a sequence number.");
    const events = await stub.events(after);
    return events ? json(200, { events }) : error(404, "No such run.");
  }

  if (sub === "/ws") {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket")
      return error(426, "Expected a WebSocket upgrade.");
    if (afterOf(url) === null) return error(400, "after is a sequence number.");
    return stub.fetch(request);
  }

  const version = Number(match[3]);
  const snapshot = await stub.snapshot(version);
  return snapshot ? json(200, snapshot) : error(404, "No such version.");
}
