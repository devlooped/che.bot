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
import { createLocalJWKSet, exportJWK, generateKeyPair, type JWTPayload, SignJWT } from "jose";
import { onTestFinished } from "vitest";
import { auth0Identity } from "../src/worker/auth0.ts";
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

export const QUESTION = "¿Cuál es la capital de Australia y cuánta gente vive ahí?";

/** Where the tests send their requests; the hook of a run paid through the API points here. */
export const ORIGIN = "https://chebot.test";
export const HOOK_URL = `${ORIGIN}/api/pay/hook`;

/**
 * The stand-in for the Auth0 check in most tests: the user of the x-test-user header, with the
 * roles of x-test-roles; anonymous without it. The Auth0 check itself is tested with real tokens
 * (see `signer`).
 */
export const testIdentity: IdentityResolver = async (request) => {
  const userId = request.headers.get("x-test-user");
  if (!userId) return { kind: "anonymous" };
  const roles = request.headers.get("x-test-roles");
  return { kind: "user", userId, roles: roles ? roles.split(",") : [] };
};

export function as(userId: string, roles: string[] = []): Record<string, string> {
  return { "x-test-user": userId, ...(roles.length ? { "x-test-roles": roles.join(",") } : {}) };
}

/** A user of the beta: may ask before launch. */
export const beta = (userId: string) => as(userId, ["beta"]);

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

  /** The user pays the QR: the service calls the hook of the job, and queues it if it answers 2xx. */
  async pay(id: string, token?: string): Promise<Response> {
    const entry = this.jobs.get(id);
    if (!entry) throw new Error(`no job ${id}`);
    const response = await api("/api/pay/hook", {
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

/**
 * The keys of a fake Auth0 tenant: tokens signed with its private key, verified through a local
 * JWKS that replaces the tenant's (no network).
 */
export async function signer() {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "test-key", alg: "RS256", use: "sig" };
  const jwks = createLocalJWKSet({ keys: [jwk] });
  overrideDeps({ jwks: () => jwks, identify: (request, e) => auth0Identity(request, e, jwks) });
  const issuer = `https://${env.AUTH0_DOMAIN}/`;
  return {
    jwk,
    issuer,
    /** An access token of the tenant for this API; `claims` and `options` change it. */
    async token(
      sub: string,
      claims: JWTPayload = {},
      options: { key?: CryptoKey; issuer?: string; audience?: string; expiresIn?: string } = {},
    ) {
      return new SignJWT({ ...claims })
        .setProtectedHeader({ alg: "RS256", kid: "test-key" })
        .setSubject(sub)
        .setIssuer(options.issuer ?? issuer)
        .setAudience(options.audience ?? env.AUTH0_AUDIENCE)
        .setIssuedAt()
        .setExpirationTime(options.expiresIn ?? "1h")
        .sign(options.key ?? privateKey);
    },
  };
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

export function api(path: string, init: RequestInit = {}) {
  return exports.default.fetch(new Request(`${ORIGIN}${path}`, init));
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
