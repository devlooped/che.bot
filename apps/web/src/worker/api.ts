import { deps } from "./deps.ts";
import type { Env } from "./env.ts";
import { type Identity, isAdmin } from "./identity.ts";
import { listRuns } from "./settings.ts";

// The HTTP API. The caller's identity is resolved once, here, for every route; the guards below
// read it. The routes of the quote, the payment, its hook and the admin (steps 18 to 25) go into
// the same table.

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

const error = (status: number, message: string) => json(status, { error: message });

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const RUN_PATH = new RegExp(`^/api/runs/(${UUID})(/events|/ws|/rerun|/snapshots/(\\d+))?$`, "i");

/** The object of a run: one per question, named by the run id. */
export function runStub(env: Env, id: string) {
  return env.RUNS.get(env.RUNS.idFromName(id.toLowerCase()));
}

/** A user, or 401. */
function requireUser(identity: Identity): Extract<Identity, { kind: "user" }> | Response {
  return identity.kind === "user" ? identity : error(401, "Sign in first.");
}

/** A sequence number of the query, or null when it is not one. */
function afterOf(url: URL): number | null {
  const raw = url.searchParams.get("after") ?? "0";
  const after = Number(raw);
  return /^\d+$/.test(raw) && Number.isSafeInteger(after) ? after : null;
}

export async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/")) return error(404, "Not found.");
  let identity: Identity;
  try {
    identity = await deps.identify(request, env);
  } catch {
    return error(401, "The access token is not valid.");
  }
  const method = request.method;

  if (url.pathname === "/api/me/runs") {
    if (method !== "GET") return error(405, "Method not allowed.");
    const user = requireUser(identity);
    if (user instanceof Response) return user;
    return json(200, { runs: await listRuns(env.DB, user.userId) });
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
