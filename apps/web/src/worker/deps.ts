import type { ConfigOverrides } from "@chebot/protocol";
import {
  type CatalogModel,
  type Classification,
  type ClassifyRequest,
  classify,
  createGatewayProvider,
  gatewayCatalog,
  type ModelProvider,
} from "@chebot/providers";
import type { Env } from "./env.ts";
import { type IdentityResolver, noSignIn } from "./identity.ts";

// What the runtime takes from the outside world, in one place: the Worker and the RunObject read
// these, and tests replace them with `overrideDeps` (the tests run in the same isolate as the
// Worker and its Durable Objects).

/** Classifies a question with the decision model of the run snapshot (step 20). */
export interface Classifier {
  classify(req: ClassifyRequest): Promise<Classification>;
}

/** The payment job of a run in the CheBot jobs service (step 21). The job id is the run id. */
export interface JobsClient {
  /** POST /jobs/:id with the amount in ARS and the automation hook that calls back the app. */
  enqueue(job: {
    id: string;
    amount: number;
    currency: string;
    hook: { url: string; token: string };
  }): Promise<void>;
  /** GET /jobs/:id: the status, and the Mercado Pago QR once the job is pending. */
  get(id: string): Promise<{ status: string; qr: string | null }>;
  /** DELETE /jobs/:id: cancels a job that was not paid. */
  cancel(id: string): Promise<void>;
  /** PATCH /jobs/:id: ends the job with the outcome of the run. */
  finish(id: string, status: "done" | "failed", message: string): Promise<void>;
}

export interface Deps {
  /** The model calls of a run. */
  provider(env: Env): ModelProvider;
  /** The Gateway catalog; cached per isolate. */
  catalog(env: Env): Promise<CatalogModel[]>;
  classifier(env: Env): Classifier;
  jobs(env: Env): JobsClient;
  /** Who calls: see identity.ts. */
  identify: IdentityResolver;
  /** The run configuration: the protocol's defaults, with the budget of RUN_BUDGET_USD. */
  runConfig(env: Env): ConfigOverrides;
  /** The wait between two alarm ticks of a run; 0 in production. */
  tickDelayMs: number;
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

const defaults: Deps = {
  provider: (env) => createGatewayProvider({ apiKey: env.AI_GATEWAY_API_KEY }),
  catalog: () => gatewayCatalog(),
  classifier: (env) => ({ classify: (req) => classify(req, { apiKey: env.AI_GATEWAY_API_KEY }) }),
  jobs: () => {
    throw new Error("The jobs service client is written in step 21.");
  },
  identify: noSignIn,
  runConfig: budgetOverride,
  tickDelayMs: 0,
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
