import type { RunObject } from "./run-object.ts";
import type { SpendMeter } from "./spend-meter.ts";

/** The bindings, variables and secrets of the Worker (see wrangler.jsonc and .dev.vars.example). */
export interface Env {
  RUNS: DurableObjectNamespace<RunObject>;
  SPEND: DurableObjectNamespace<SpendMeter>;
  DB: D1Database;
  /** The budget of one question in USD; empty means the protocol's default. */
  RUN_BUDGET_USD: string;
  // Secrets
  AI_GATEWAY_API_KEY: string;
  JOBS_URL: string;
  JOBS_TOKEN: string;
  AUTH0_DOMAIN: string;
  AUTH0_AUDIENCE: string;
}
