import { linkOf, parseRunRef, resolveConfig } from "@chebot/protocol";
import { readModels, updateModels, updatePrices } from "./admin.ts";
import { handleAuth } from "./auth0.ts";
import { deps } from "./deps.ts";
import type { Env } from "./env.ts";
import { type Identity, isAdmin, mayAsk, type User } from "./identity.ts";
import { questionOf, quoteQuestion } from "./quote.ts";
import { runStub } from "./run-object.ts";
import { fromThisOrigin } from "./session.ts";
import {
  cursorOf,
  findLink,
  linkOfRun,
  listPublicRuns,
  listRuns,
  readPrices,
  resolveRunModels,
  setReplaces,
  setRunDeleted,
  shareOf,
  visibilityOf,
} from "./settings.ts";
import { withPreview } from "./share.ts";
import { spendMeter } from "./spend-meter.ts";

// The HTTP API, the sign-in routes of auth0.ts under /auth/, and the pages of runs under /r/. Who
// may call each route:
//
//   GET    /r/:ref                    anyone: the page of a run (the app, with the preview of its
//                                    link); a UUID or a short link redirects for good to the run's
//                                    link once it has one
//   GET    /api/links/:ref            anyone: the UUID and the link of a run, by its link
//   GET    /api/me                    anyone: the signed-in user, or null
//   GET    /api/runs?after=:id        anyone: the questions asked, newest first (the home page);
//                                    `mine` marks the caller's
//   POST   /api/runs                  signed in, Admin or Contrib role until launch: the quote;
//                                    `replaces`, a run of the caller's that the new one replaces
//   POST   /api/runs/:id/pay          the owner (an admin owner runs free, with no job)
//   POST   /api/runs/:id/rerun        the owner, after a paid run failed
//   DELETE /api/runs/:id              the owner, who may restore it; an admin, for good
//   POST   /api/runs/:id/restore      the owner, after deleting it
//   POST   /api/runs/:id/cancel       the owner, while the run is in progress: deletes it for good
//   GET    /api/runs/:id[/events|/ws|/snapshots/:v]   anyone with the link (`mine` for the owner);
//                                    a deleted run, its owner only: 410 for anyone else
//   GET    /api/runs/:id/charts/:chart/:v.svg  the render of a chart at version v, as above
//   GET    /api/runs/:id/image[?v=]   the picture of the question, as above
//   POST   /api/runs/:id/image        the owner, once it was asked, or an admin: draws the picture
//                                    again, with today's models
//   GET    /api/runs/:id/spend        admin: what the run's model calls cost so far
//   GET    /api/me/runs               signed in
//   GET|PUT /api/admin/models|prices  admin
//   POST   /api/pay/hook              the jobs service, with the token of the run as Bearer
//
// The caller's identity is resolved once per request (deps.identify, the session cookie); a
// cookie that is not valid is no user. Because the identity is a cookie, a request that changes
// something (any method but GET and HEAD) must come from a page of this origin; the hook of the
// jobs service, which carries its own token and no cookie, is the one exception.

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
  `^/api/runs/(${UUID})(/events|/ws|/pay|/rerun|/restore|/cancel|/spend|/image|/snapshots/(\\d+)|/charts/(c\\d+)/(\\d+)\\.svg)?$`,
  "i",
);

/** The last segment of the path of a run's page. */
const RUN_PAGE = /^\/r\/([^/]+)\/?$/;
const LINK_PATH = /^\/api\/links\/([^/]+)$/;

/**
 * The run that a link names (run-link.ts of the protocol), by the whole link, else by its short
 * part: its UUID and its link. Null for anything else.
 */
async function resolveLink(env: Env, ref: string): Promise<{ id: string; link: string } | null> {
  const parsed = parseRunRef(ref);
  if (parsed?.kind !== "link") return null;
  return findLink(env.DB, parsed.short, parsed.words ? linkOf(parsed.short, parsed.words) : null);
}

/**
 * GET /r/:ref: the app's page. A run named by its UUID or by a link that is not its own (the short
 * part alone, or other words) redirects for good to its link; any other path is the app, which
 * says when there is no such run, with the preview of the run for the sites it is shared on
 * (share.ts). A failure of D1 serves the app, which resolves the run itself.
 */
async function runPage(request: Request, env: Env, ref: string): Promise<Response> {
  let to: string | null = null;
  let id: string | null = null;
  try {
    const parsed = parseRunRef(ref);
    if (parsed?.kind === "uuid") {
      id = parsed.id;
      to = await linkOfRun(env.DB, parsed.id);
    } else if (parsed?.kind === "link") {
      const found = await resolveLink(env, ref);
      if (found && found.link !== ref) to = found.link;
      else id = found?.id ?? null;
    }
  } catch (e) {
    console.error("The link of a run page could not be read.", e);
  }
  if (!to) return previewPage(request, env, id);
  const url = new URL(request.url);
  return new Response(null, {
    status: 301,
    headers: { location: `/r/${to}${url.search}` },
  });
}

/**
 * The app's page of the run `id`, with its preview in the head; without one when there is no such
 * run, its owner deleted it, or D1 fails.
 */
async function previewPage(request: Request, env: Env, id: string | null): Promise<Response> {
  const page = await env.ASSETS.fetch(request);
  if (!id || request.method !== "GET" || !page.ok) return page;
  if (!page.headers.get("content-type")?.includes("text/html")) return page;
  try {
    const share = await shareOf(env.DB, id);
    if (share && !share.deleted) return withPreview(page, share, new URL(request.url).origin);
  } catch (e) {
    console.error("The preview of a run page could not be read.", e);
  }
  return page;
}

/** A path segment decoded, or "" when it is not valid percent-encoding. */
function segment(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return "";
  }
}

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
 * the Admin or Contrib role until launch; the rate limit of the user; the question and its length;
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
  // Asking again from the page of a run: the new run takes its place once it starts.
  const replaces = (read.body as { replaces?: unknown }).replaces ?? null;
  if (replaces !== null) {
    if (typeof replaces !== "string" || !UUID_ONLY.test(replaces))
      return error(400, "replaces is the id of a run.");
    if ((await visibilityOf(env.DB, replaces.toLowerCase()))?.owner !== user.userId)
      return error(404, "No such run.");
  }
  const meter = spendMeter(env);
  const budget = resolveConfig(deps.runConfig(env)).budgetUsd;
  if (!(await meter.status(budget)).open)
    return error(503, "The daily limit was reached. Try again tomorrow.", {
      reason: "daily_cap",
    });
  const quote = await quoteQuestion(env, user.userId, parsed.question);
  if (typeof replaces === "string") await setReplaces(env.DB, quote.runId, replaces.toLowerCase());
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

/** The questions of a page of the home page. */
export const PUBLIC_PAGE = 24;

/**
 * GET /api/runs: the questions that were asked, newest first, PUBLIC_PAGE at a time; `after`, the
 * last run of the page before. `next` is the run to ask after for the next page, null at the end.
 * `mine` marks the caller's questions.
 */
async function publicRuns(env: Env, url: URL, identity: Identity): Promise<Response> {
  const after = url.searchParams.get("after");
  let before: { createdAt: string; id: string } | null = null;
  if (after !== null) {
    if (!UUID_ONLY.test(after)) return error(400, "after is the id of a run.");
    before = await cursorOf(env.DB, after.toLowerCase());
    if (!before) return error(404, "No such run.");
  }
  const reader = identity.kind === "user" ? identity.userId : null;
  const runs = await listPublicRuns(env.DB, PUBLIC_PAGE + 1, before, reader);
  const page = runs.slice(0, PUBLIC_PAGE);
  return json(200, {
    runs: page,
    next: runs.length > PUBLIC_PAGE ? (page.at(-1)?.id ?? null) : null,
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
  if (url.pathname.startsWith("/auth/")) return handleAuth(request, env);
  const page = RUN_PAGE.exec(url.pathname);
  if (page?.[1] && (request.method === "GET" || request.method === "HEAD"))
    return runPage(request, env, segment(page[1]));
  if (!url.pathname.startsWith("/api/")) return error(404, "Not found.");
  const method = request.method;

  // Called by the jobs service, with the token of the run instead of a session.
  if (url.pathname === "/api/pay/hook") {
    if (method !== "POST") return error(405, "Method not allowed.");
    return payHook(request, env);
  }

  if (method !== "GET" && method !== "HEAD" && !fromThisOrigin(request))
    return error(403, "This request does not come from this site.");

  const identity = await deps.identify(request, env);

  if (url.pathname === "/api/me") {
    if (method !== "GET") return error(405, "Method not allowed.");
    if (identity.kind !== "user") return json(200, null);
    return json(200, {
      id: identity.userId,
      name: identity.name,
      admin: isAdmin(identity),
      mayAsk: mayAsk(identity, env),
    });
  }

  const linked = LINK_PATH.exec(url.pathname);
  if (linked?.[1]) {
    if (method !== "GET") return error(405, "Method not allowed.");
    const found = await resolveLink(env, segment(linked[1]));
    return found ? json(200, found) : error(404, "No such run.");
  }

  if (url.pathname === "/api/runs") {
    if (method === "GET") return publicRuns(env, url, identity);
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

  // A run its owner deleted is theirs alone: anyone else is told so, and led to the run that
  // replaced it, if any.
  const visibility = method === "GET" ? await visibilityOf(env.DB, id) : null;
  if (visibility?.deleted && !(identity.kind === "user" && identity.userId === visibility.owner))
    return error(410, "Its author deleted this run.", {
      reason: "deleted",
      replacedBy: visibility.replacedBy,
    });

  if (sub === "") {
    if (method === "GET") {
      const summary = await stub.summary();
      if (!summary) return error(404, "No such run.");
      // `mine` tells the page whether to offer the owner's actions (pay, run again, delete).
      const mine = identity.kind === "user" && (await stub.owner()) === identity.userId;
      return json(200, { ...summary, mine, deleted: visibility?.deleted ?? false });
    }
    if (method === "DELETE") {
      const user = requireUser(identity);
      if (user instanceof Response) return user;
      const owner = await stub.owner();
      if (owner === null) return error(404, "No such run.");
      // The owner's delete hides the run and can be undone; an admin's removes it for good.
      if (owner === user.userId)
        return (await setRunDeleted(env.DB, id, owner, true))
          ? new Response(null, { status: 204 })
          : error(404, "No such run.");
      if (!isAdmin(user)) return error(403, "Not your run.");
      return (await stub.remove())
        ? new Response(null, { status: 204 })
        : error(404, "No such run.");
    }
    return error(405, "Method not allowed.");
  }

  if (sub === "/restore") {
    if (method !== "POST") return error(405, "Method not allowed.");
    const user = requireUser(identity);
    if (user instanceof Response) return user;
    const owner = await stub.owner();
    if (owner === null) return error(404, "No such run.");
    if (owner !== user.userId) return error(403, "Not your run.");
    return (await setRunDeleted(env.DB, id, owner, false))
      ? new Response(null, { status: 204 })
      : error(404, "No such run.");
  }

  if (sub === "/cancel") {
    if (method !== "POST") return error(405, "Method not allowed.");
    const user = requireUser(identity);
    if (user instanceof Response) return user;
    const owner = await stub.owner();
    if (owner === null) return error(404, "No such run.");
    if (owner !== user.userId) return error(403, "Not your run.");
    const result = await stub.cancel();
    if (result === "ok") return new Response(null, { status: 204 });
    return result === "not_found"
      ? error(404, "No such run.")
      : json(409, { error: "This run is no longer in progress.", reason: "ended" });
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

  if (sub === "/image" && method === "POST") {
    const user = requireUser(identity);
    if (user instanceof Response) return user;
    const owner = await stub.owner();
    if (owner === null) return error(404, "No such run.");
    // The owner draws theirs once it was asked, under the guardrails of asking; an admin, any.
    if (!isAdmin(user)) {
      if (owner !== user.userId) return error(403, "Not your run.");
      const status = (await stub.summary())?.status;
      if (status !== "running" && status !== "completed" && status !== "failed")
        return json(409, { error: "This run was not asked yet.", reason: "not_started" });
      if (!(await env.ASK_LIMITER.limit({ key: user.userId })).success)
        return error(429, "Too many in a row. Wait a minute.");
      const budget = resolveConfig(deps.runConfig(env)).budgetUsd;
      if (!(await spendMeter(env).status(budget)).open)
        return error(503, "The daily limit was reached. Try again tomorrow.", {
          reason: "daily_cap",
        });
    }
    const models = await resolveRunModels(env);
    if (!models.image) return error(503, "No image model is set.");
    const drawn = await stub.redraw({ helper: models.helper ?? null, image: models.image });
    if (drawn) return json(200, { image: (await stub.summary())?.image ?? null });
    return (await stub.summary())
      ? error(502, "The picture could not be drawn.")
      : error(404, "No such run.");
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

  if (sub === "/spend") {
    const admin = requireAdmin(identity);
    if (admin instanceof Response) return admin;
    const spend = await stub.spend();
    return spend ? json(200, spend) : error(404, "No such run.");
  }

  if (sub === "/ws") {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket")
      return error(426, "Expected a WebSocket upgrade.");
    if (afterOf(url) === null) return error(400, "after is a sequence number.");
    return stub.fetch(request);
  }

  if (sub === "/image") {
    const image = await stub.image();
    if (!image) return error(404, "No picture.");
    // A versioned URL never changes: a picture drawn again has another version.
    const versioned = url.searchParams.get("v") === image.version;
    return new Response(image.bytes, {
      headers: {
        "content-type": image.mediaType,
        // the SVG of the local mode runs nothing either way
        "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'",
        "x-content-type-options": "nosniff",
        "cache-control": versioned ? "public, max-age=31536000, immutable" : "public, max-age=300",
      },
    });
  }

  if (match[4] !== undefined) {
    const svg = await stub.chartSvg(match[4].toLowerCase(), Number(match[5]));
    if (svg === null) return error(404, "No such chart.");
    return new Response(svg, {
      headers: {
        "content-type": "image/svg+xml; charset=utf-8",
        // the SVG is the renderer's, with the models' texts escaped; it runs nothing either way
        "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'",
        "x-content-type-options": "nosniff",
      },
    });
  }

  const version = Number(match[3]);
  const snapshot = await stub.snapshot(version);
  return snapshot ? json(200, snapshot) : error(404, "No such version.");
}
