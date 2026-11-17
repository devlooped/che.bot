import type { RunObject } from "./run-object.ts";
import type { SpendMeter } from "./spend-meter.ts";

/** The bindings, variables and secrets of the Worker (see wrangler.jsonc and .dev.vars.example). */
export interface Env {
  RUNS: DurableObjectNamespace<RunObject>;
  SPEND: DurableObjectNamespace<SpendMeter>;
  DB: D1Database;
  /** The brake on POST /api/runs, per user (approximate, per Cloudflare location). */
  ASK_LIMITER: RateLimit;
  /** The budget of one question in USD; empty means the protocol's default. */
  RUN_BUDGET_USD: string;
  /** The global spend cap of a day (UTC) in USD, over every run. */
  DAILY_CAP_USD: string;
  /** "true" opens asking to every signed-in user; until then it needs the Admin or Contrib role. */
  LAUNCHED: string;
  // Secrets
  AI_GATEWAY_API_KEY: string;
  JOBS_URL: string;
  JOBS_TOKEN: string;
  /** The Auth0 tenant, such as tenant.us.auth0.com. */
  AUTH0_DOMAIN: string;
  /** The regular web application of the tenant that signs users in (auth0.ts). */
  AUTH0_CLIENT_ID: string;
  AUTH0_CLIENT_SECRET: string;
  /** Signs the session and sign-in cookies (session.ts); at least 32 characters. */
  SESSION_SECRET: string;
}
