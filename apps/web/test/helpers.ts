import { runDurableObjectAlarm } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { CATALOG, script } from "@chebot/driver/testing";
import type { ConfigOverrides, LoggedEvent, QuestionClass } from "@chebot/protocol";
import {
  type CatalogModel,
  type Classification,
  type ClassifyRequest,
  FakeProvider,
  type FakeScript,
} from "@chebot/providers";
import {
  base64url,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWTPayload,
  SignJWT,
} from "jose";
import { onTestFinished } from "vitest";
import { type Classifier, deps, overrideDeps } from "../src/worker/deps.ts";
import type { IdentityResolver } from "../src/worker/identity.ts";
import {
  type EnqueueJob,
  type JobSnapshot,
  type JobStatus,
  type JobsClient,
  JobsError,
} from "../src/worker/jobs.ts";
import { runStub } from "../src/worker/run-object.ts";
import { sessionIdentity } from "../src/worker/session.ts";

export const QUESTION = "¿Cuál es la capital de Australia y cuánta gente vive ahí?";

/** Where the tests send their requests; the hook of a run paid through the API points here. */
export const ORIGIN = "https://chebot.test";
export const HOOK_URL = `${ORIGIN}/api/pay/hook`;

/**
 * The stand-in for the session in most tests: the user of the x-test-user header, with the roles
 * of x-test-roles; anonymous without it. The sign-in and the session cookie themselves are tested
 * against a fake tenant (see `fakeTenant`).
 */
export const testIdentity: IdentityResolver = async (request) => {
  const userId = request.headers.get("x-test-user");
  if (!userId) return { kind: "anonymous" };
  const roles = request.headers.get("x-test-roles");
  return { kind: "user", userId, name: userId, roles: roles ? roles.split(",") : [] };
};

export function as(userId: string, roles: string[] = []): Record<string, string> {
  return { "x-test-user": userId, ...(roles.length ? { "x-test-roles": roles.join(",") } : {}) };
}

/** A contributor: may ask before launch. */
export const contrib = (userId: string) => as(userId, ["Contrib"]);

/** A scripted jobs service in memory, with the rules of the real one that the app relies on. */
export class FakeJobs implements JobsClient {
  readonly jobs = new Map<
    string,
    { job: EnqueueJob; status: JobStatus; qr: string | null; message: string | null }
  >();
  /** Every call, as "method:id". */
  readonly calls: string[] = [];
  /** Reads of a new job that answer "created" before its QR appears. */
  qrAfter = 0;
  /** Calls that fail once with this error, by method. */
  readonly failures = new Map<keyof JobsClient, Error>();
  private reads = new Map<string, number>();

  private check(method: keyof JobsClient, id: string) {
    this.calls.push(`${method}:${id}`);
    const failure = this.failures.get(method);
    if (failure) {
      this.failures.delete(method);
      throw failure;
    }
  }

  count(method: keyof JobsClient, id?: string) {
    return this.calls.filter((c) => c === `${method}:${id}` || (!id && c.startsWith(`${method}:`)))
      .length;
  }

  async enqueue(job: EnqueueJob) {
    this.check("enqueue", job.id);
    if (this.jobs.has(job.id)) return; // "Already enqueued.", which the client reads as success
    this.jobs.set(job.id, { job, status: "created", qr: null, message: null });
  }

  async get(id: string): Promise<JobSnapshot> {
    this.check("get", id);
    const entry = this.jobs.get(id);
    if (!entry) throw new JobsError(404, "Not found.");
    const reads = (this.reads.get(id) ?? 0) + 1;
    this.reads.set(id, reads);
    if (entry.status === "created" && reads > this.qrAfter) {
      entry.status = "pending";
      entry.qr = `00020101021243650016COM.MERCADOLIBRE-${id}`;
    }
    return {
      status: entry.status,
      qr: entry.status === "pending" ? entry.qr : null,
      message: entry.message,
    };
  }

  async cancel(id: string) {
    this.check("cancel", id);
    const entry = this.jobs.get(id);
    if (!entry) return;
    if (entry.status !== "created" && entry.status !== "pending")
      throw new JobsError(409, "Not cancellable.");
    this.jobs.delete(id);
  }

  async finish(id: string, status: "done" | "failed", message: string) {
    this.check("finish", id);
    const entry = this.jobs.get(id);
    if (!entry || (entry.status !== "queued" && entry.status !== "running"))
      throw new JobsError(409, "Not ready.");
    entry.status = status;
    entry.message = message;
  }

  /**
   * The user pays the QR: the service calls the hook of the job as a server does (no Origin, no
   * cookie), and queues the job if the hook answers 2xx.
   */
  async pay(id: string, token?: string): Promise<Response> {
    const entry = this.jobs.get(id);
    if (!entry) throw new Error(`no job ${id}`);
    const response = await send("/api/pay/hook", {
      method: "POST",
      headers: { authorization: `Bearer ${token ?? entry.job.hook.token}` },
      body: JSON.stringify({ actor: entry.job.actor, id, input: [] }),
    });
    if (response.ok) entry.status = "queued";
    else {
      entry.status = "failed";
      entry.message = `Automation returned ${response.status}.`;
    }
    return response;
  }
}

/** A classifier that answers a fixed choice and probability, and counts its calls. */
export class FakeClassifier implements Classifier {
  readonly questions: string[] = [];
  constructor(
    public choice: QuestionClass = "complex",
    public probability: number | null = 0.88,
    public fail = false,
  ) {}

  async classify(req: ClassifyRequest): Promise<Classification> {
    this.questions.push(req.question);
    if (this.fail) throw new Error("the decision model is down");
    const probability = this.probability;
    return {
      class:
        this.choice === "simple" && probability !== null && probability >= 0.7
          ? "simple"
          : "complex",
      choice: this.choice,
      probability,
      usage: { inputTokens: 10, outputTokens: 1 },
      costUsd: 0.001,
      latencyMs: 1,
    };
  }
}

/**
 * Replaces the outside world for one test: a scripted FakeProvider, a fixed catalog, a fake
 * classifier and jobs service, the test identity, a SpendMeter of its own, and alarms that never
 * fire by themselves (the test runs each tick).
 */
export function fakes(
  options: {
    calls?: FakeScript["calls"];
    config?: ConfigOverrides;
    catalog?: CatalogModel[];
    /** Another script than the prose run's, such as a chart run's. */
    respond?: FakeScript["respond"];
  } = {},
) {
  const provider = new FakeProvider(
    options.respond
      ? { calls: options.calls ?? {}, respond: options.respond }
      : script(options.calls),
  );
  const catalog = options.catalog ?? CATALOG;
  const jobs = new FakeJobs();
  const classifier = new FakeClassifier();
  const restore = overrideDeps({
    provider: () => provider,
    catalog: async () => catalog,
    classifier: () => classifier,
    jobs: () => jobs,
    identify: testIdentity,
    runConfig: () => options.config ?? {},
    tickDelayMs: 3_600_000,
    spendMeterName: `test-${crypto.randomUUID()}`,
  });
  // D1 keeps its rows from one test to the next in a file: the settings of a test go with it.
  onTestFinished(async () => {
    restore();
    await env.DB.batch([
      env.DB.prepare("DELETE FROM model_settings"),
      env.DB.prepare(
        "UPDATE prices SET amount = CASE class WHEN 'simple' THEN 5000 ELSE 10000 END",
      ),
    ]);
  });
  return { provider, catalog, jobs, classifier };
}

/** A user at the fake tenant: who signs in, and what their tokens say. */
export interface TenantUser {
  sub: string;
  /** Claims of the ID token, such as name and roles. */
  claims?: JWTPayload;
  /** Changes the ID token: another key, issuer, audience, nonce or expiry. */
  idToken?: TokenOptions;
  /** A JWT access token with these claims; an opaque one without. */
  access?: JWTPayload;
}

export interface TokenOptions {
  key?: CryptoKey;
  issuer?: string;
  audience?: string;
  expiresIn?: string;
  nonce?: string;
}

const s256 = async (verifier: string) =>
  base64url.encode(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))),
  );

/**
 * A fake Auth0 tenant with the rules of the real one that the sign-in relies on: `authorize` plays
 * the user signing in at its /authorize page and gives the callback URL with a code; its token
 * endpoint (deps.auth0Fetch) gives the tokens of a code once, to the client with its secret, the
 * same redirect_uri and the code verifier of the PKCE challenge; its keys replace the JWKS. The
 * session is the real one (session.ts).
 */
export async function fakeTenant() {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "test-key", alg: "RS256", use: "sig" };
  const jwks = createLocalJWKSet({ keys: [jwk] });
  const issuer = `https://${env.AUTH0_DOMAIN}/`;
  const codes = new Map<
    string,
    { user: TenantUser; nonce: string; challenge: string; redirectUri: string }
  >();
  /** The forms the token endpoint received. */
  const exchanges: URLSearchParams[] = [];

  /** A token of the tenant: an ID token of the app unless `options` say otherwise. */
  async function token(sub: string, claims: JWTPayload = {}, options: TokenOptions = {}) {
    return new SignJWT({ ...claims, ...(options.nonce ? { nonce: options.nonce } : {}) })
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setSubject(sub)
      .setIssuer(options.issuer ?? issuer)
      .setAudience(options.audience ?? env.AUTH0_CLIENT_ID)
      .setIssuedAt()
      .setExpirationTime(options.expiresIn ?? "1h")
      .sign(options.key ?? privateKey);
  }

  async function tokenEndpoint(request: Request): Promise<Response> {
    const refused = (status = 403) => Response.json({ error: "invalid_grant" }, { status });
    if (request.url !== `${issuer}oauth/token` || request.method !== "POST") return refused(404);
    const form = new URLSearchParams(await request.text());
    exchanges.push(form);
    const code = form.get("code") ?? "";
    const grant = codes.get(code);
    if (
      !grant ||
      form.get("grant_type") !== "authorization_code" ||
      form.get("client_id") !== env.AUTH0_CLIENT_ID ||
      form.get("client_secret") !== env.AUTH0_CLIENT_SECRET ||
      form.get("redirect_uri") !== grant.redirectUri ||
      (await s256(form.get("code_verifier") ?? "")) !== grant.challenge
    )
      return refused();
    codes.delete(code);
    const { user } = grant;
    return Response.json({
      token_type: "Bearer",
      id_token: await token(user.sub, user.claims, { nonce: grant.nonce, ...user.idToken }),
      access_token: user.access
        ? await token(user.sub, user.access, { audience: `${issuer}userinfo` })
        : "opaque-access-token",
    });
  }

  overrideDeps({ jwks: () => jwks, auth0Fetch: tokenEndpoint, identify: sessionIdentity });

  return {
    jwk,
    issuer,
    exchanges,
    token,
    /** The user signs in at the /authorize URL of `location`; returns the callback URL. */
    authorize(location: string, user: TenantUser): string {
      const url = new URL(location);
      if (`${url.origin}/` !== issuer || url.pathname !== "/authorize")
        throw new Error(`not the tenant's /authorize: ${location}`);
      const q = url.searchParams;
      if (q.get("client_id") !== env.AUTH0_CLIENT_ID || q.get("code_challenge_method") !== "S256")
        throw new Error(`not a PKCE request of the app: ${location}`);
      const code = crypto.randomUUID();
      codes.set(code, {
        user,
        nonce: q.get("nonce") ?? "",
        challenge: q.get("code_challenge") ?? "",
        redirectUri: q.get("redirect_uri") ?? "",
      });
      const back = new URL(q.get("redirect_uri") ?? "");
      back.search = new URLSearchParams({ code, state: q.get("state") ?? "" }).toString();
      return back.href;
    },
  };
}

export type FakeTenant = Awaited<ReturnType<typeof fakeTenant>>;

/** The cookies a response sets, by name. */
export function cookiesOf(response: Response): Map<string, { value: string; attributes: string }> {
  const out = new Map<string, { value: string; attributes: string }>();
  for (const line of response.headers.getSetCookie()) {
    const [pair = "", ...rest] = line.split(";");
    const at = pair.indexOf("=");
    out.set(pair.slice(0, at).trim(), {
      value: pair.slice(at + 1).trim(),
      attributes: rest.join(";").trim(),
    });
  }
  return out;
}

/** The cookies of the app on an https origin. */
export const SESSION_COOKIE = "__Host-chebot_session";
export const LOGIN_COOKIE = "__Host-chebot_login";

/** The Cookie header of a session token. */
export const withSession = (token: string) => ({ cookie: `${SESSION_COOKIE}=${token}` });

/**
 * Signs `user` in through /auth/login, the tenant and /auth/callback; returns the answers, and the
 * session token the callback set (null when it set none). `tamper` changes the callback URL, and
 * `loginCookie` the sign-in cookie the browser sends back (null: none).
 */
export async function signInThrough(
  tenant: FakeTenant,
  user: TenantUser,
  options: { returnTo?: string; tamper?: (url: URL) => void; loginCookie?: string | null } = {},
) {
  const query = options.returnTo ? `?returnTo=${encodeURIComponent(options.returnTo)}` : "";
  const login = await api(`/auth/login${query}`);
  const sent = cookiesOf(login).get(LOGIN_COOKIE)?.value ?? "";
  const url = new URL(tenant.authorize(login.headers.get("location") ?? "", user));
  options.tamper?.(url);
  const cookie = options.loginCookie === undefined ? sent : options.loginCookie;
  const callback = await api(`${url.pathname}${url.search}`, {
    headers: cookie === null ? {} : { cookie: `${LOGIN_COOKIE}=${cookie}` },
  });
  const session = cookiesOf(callback).get(SESSION_COOKIE)?.value || null;
  return { login, callback, session };
}
export async function quoted(owner = "user-1", id: string = crypto.randomUUID()) {
  const stub = runStub(env, id);
  await stub.quote({
    id,
    owner,
    question: QUESTION,
    class: "complex",
    probability: 0.88,
    amount: 10000,
    currency: "ARS",
  });
  return { id, stub };
}

/** A run whose owner asked to pay (its first alarm enqueues the job), not yet paid. */
export async function paying(owner = "user-1") {
  const run = await quoted(owner);
  await run.stub.pay({ hookUrl: HOOK_URL, free: false });
  return run;
}

/**
 * A paid run, started: the first alarm enqueued the job and showed its QR, the user paid it and
 * the jobs service called the hook. Its next tick is the drafting stage.
 */
export async function paidRun(owner = "user-1") {
  const run = await paying(owner);
  if (!(await runDurableObjectAlarm(run.stub))) throw new Error("no payment alarm");
  const paid = await (deps.jobs(env) as FakeJobs).pay(run.id);
  if (paid.status !== 200) throw new Error(`the hook answered ${paid.status}`);
  return run;
}

/** Runs the alarms of a run until none is scheduled; returns how many ran. */
export async function runAlarms(stub: DurableObjectStub, max = 60): Promise<number> {
  for (let n = 0; n < max; n++) if (!(await runDurableObjectAlarm(stub))) return n;
  throw new Error("the run did not end");
}

/** A request to the Worker as it arrives, with only the headers of `init`; redirects are answers. */
export function send(path: string, init: RequestInit = {}) {
  return exports.default.fetch(new Request(`${ORIGIN}${path}`, { redirect: "manual", ...init }));
}

/**
 * A request of a page of the app: a method that changes something carries the Origin of the app,
 * as a browser sends it, unless `init` sets one.
 */
export function api(path: string, init: RequestInit = {}) {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  if (method !== "GET" && method !== "HEAD" && !headers.has("origin"))
    headers.set("origin", ORIGIN);
  return send(path, { ...init, headers });
}

/** POST /api/runs as `headers`. */
export function ask(headers: Record<string, string>, question: unknown = QUESTION) {
  return api("/api/runs", {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({ question }),
  });
}

export async function eventsOf(stub: { events(after?: number): Promise<LoggedEvent[] | null> }) {
  return (await stub.events(0)) ?? [];
}
