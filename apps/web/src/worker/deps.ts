import type { ChartRenderer } from "@chebot/driver";
import type { ConfigOverrides } from "@chebot/protocol";
import {
  type CatalogModel,
  type Classification,
  type ClassifyRequest,
  classify,
  createGatewayImages,
  createGatewayProvider,
  gatewayCatalog,
  type ImageProvider,
  type ModelProvider,
} from "@chebot/providers";
import type { JWTVerifyGetKey } from "jose";
import { auth0Jwks } from "./auth0.ts";
import type { Env } from "./env.ts";
import type { IdentityResolver } from "./identity.ts";
import { createJobsClient, type JobsClient } from "./jobs.ts";
import { sessionIdentity } from "./session.ts";

// What the runtime takes from the outside world, in one place: the Worker and the Durable Objects
// read these, and tests replace them with `overrideDeps` (the tests run in the same isolate as the
// Worker and its Durable Objects).

/** Classifies a question with the decision model of the classifier role (step 20). */
export interface Classifier {
  classify(req: ClassifyRequest): Promise<Classification>;
}

export interface Deps {
  /** The model calls of a run. */
  provider(env: Env): ModelProvider;
  /** The picture of a question (the image role). */
  images(env: Env): ImageProvider;
  /** The Gateway catalog; cached per isolate. */
  catalog(env: Env): Promise<CatalogModel[]>;
  classifier(env: Env): Classifier;
  /** The payment jobs (jobs.ts). */
  jobs(env: Env): JobsClient;
  /** The public keys that sign the tenant's ID tokens: its JWKS, cached per isolate. */
  jwks(env: Env): JWTVerifyGetKey;
  /** The requests to the tenant's token endpoint (auth0.ts). */
  auth0Fetch(request: Request): Promise<Response>;
  /** Who calls: the session cookie of session.ts. */
  identify: IdentityResolver;
  /** The run configuration: the protocol's defaults, with the budget of RUN_BUDGET_USD. */
  runConfig(env: Env): ConfigOverrides;
  /** The render gate of chart runs (see `lazyRenderer`). */
  renderer(env: Env): ChartRenderer;
  /** The wait between two alarm ticks of a run; 0 in production. */
  tickDelayMs: number;
  /** The name of the one SpendMeter of the app; each test gets its own. */
  spendMeterName: string;
}

/** The budget of RUN_BUDGET_USD, when it is set. */
export function budgetOverride(env: Pick<Env, "RUN_BUDGET_USD">): ConfigOverrides {
  const raw = env.RUN_BUDGET_USD?.trim();
  if (!raw) return {};
  const budgetUsd = Number(raw);
  if (!Number.isFinite(budgetUsd) || budgetUsd <= 0)
    throw new Error(`RUN_BUDGET_USD is a positive number of USD, not ${raw}.`);
  return { budgetUsd };
}

let charts: Promise<typeof import("@chebot/charts")> | null = null;

/**
 * The render gate of chart runs, run inside RunObject: Vega in interpreter mode (@chebot/charts).
 * Its module (about 850 KiB minified) is imported on the first render call, so a Worker that only
 * answers the API never evaluates it; step 36 measured its evaluation at 40-110 ms and a first
 * render at 35 ms in the Workers runtime, far inside the 1 s startup limit (packages/charts/src/render.ts).
 */
export const lazyRenderer: ChartRenderer = {
  render: async (req) => {
    charts ??= import("@chebot/charts");
    return (await charts).renderSpecs(req);
  },
};

const defaults: Deps = {
  provider: (env) => createGatewayProvider({ apiKey: env.AI_GATEWAY_API_KEY }),
  images: (env) => createGatewayImages({ apiKey: env.AI_GATEWAY_API_KEY }),
  catalog: () => gatewayCatalog(),
  classifier: (env) => ({ classify: (req) => classify(req, { apiKey: env.AI_GATEWAY_API_KEY }) }),
  jobs: (env) => createJobsClient({ url: env.JOBS_URL, token: env.JOBS_TOKEN }),
  jwks: (env) => auth0Jwks(env),
  auth0Fetch: (request) => fetch(request),
  identify: sessionIdentity,
  runConfig: budgetOverride,
  renderer: () => lazyRenderer,
  tickDelayMs: 0,
  spendMeterName: "global",
};

export const deps: Deps = { ...defaults };

/** Replaces some dependencies; returns the function that restores the previous ones. */
export function overrideDeps(overrides: Partial<Deps>): () => void {
  const before = { ...deps };
  Object.assign(deps, overrides);
  return () => {
    Object.assign(deps, before);
  };
}
