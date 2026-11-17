import { DurableObject } from "cloudflare:workers";
import type { Env } from "./env.ts";

/**
 * The global daily spend cap: one object that reserves the worst case of a run when it starts,
 * settles the real spend when it ends, and refuses runs once the cap is reached. Step 24.
 */
export class SpendMeter extends DurableObject<Env> {}
