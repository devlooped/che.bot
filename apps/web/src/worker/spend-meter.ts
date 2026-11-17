import { DurableObject } from "cloudflare:workers";
import { deps } from "./deps.ts";
import type { Env } from "./env.ts";

/** The spend of the day (UTC) against the cap. */
export interface SpendStatus {
  day: string;
  capUsd: number;
  /** What ended runs and classifications really spent. */
  spentUsd: number;
  /** The worst case of the runs still going. */
  reservedUsd: number;
  /** Whether a new run of `needUsd` fits under the cap. */
  open: boolean;
}

/** The cap of DAILY_CAP_USD: a positive number of USD. */
export function dailyCapUsd(env: Pick<Env, "DAILY_CAP_USD">): number {
  const raw = env.DAILY_CAP_USD?.trim() ?? "";
  const cap = Number(raw);
  if (!raw || !Number.isFinite(cap) || cap <= 0)
    throw new Error(`DAILY_CAP_USD is a positive number of USD, not "${raw}".`);
  return cap;
}

/** The one SpendMeter of the app. */
export function spendMeter(env: Env) {
  return env.SPEND.get(env.SPEND.idFromName(deps.spendMeterName));
}

const today = () => new Date().toISOString().slice(0, 10);

/** Days of entries kept, for diagnostics; older ones are deleted. */
const KEEP_DAYS = 7;

/**
 * The global daily spend cap: one object for the app. A run reserves its worst case (its budget)
 * when it starts and settles its real spend when it ends; a classification settles its cost at
 * once. The total of a day is what is settled plus what is still reserved; a new question is
 * refused when its worst case does not fit under the cap. A reservation or settlement is never
 * refused: a run that was paid always runs.
 */
export class SpendMeter extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS entries (
         key TEXT PRIMARY KEY,
         day TEXT NOT NULL,
         reserved_usd REAL NOT NULL,
         spent_usd REAL,
         settled INTEGER NOT NULL DEFAULT 0
       )`,
    );
  }

  /** The spend of today, and whether `needUsd` more fits under the cap. */
  async status(needUsd = 0): Promise<SpendStatus> {
    const day = today();
    const row = this.ctx.storage.sql
      .exec<{ spent: number | null; reserved: number | null }>(
        `SELECT SUM(CASE WHEN settled = 1 THEN spent_usd ELSE 0 END) AS spent,
                SUM(CASE WHEN settled = 0 THEN reserved_usd ELSE 0 END) AS reserved
         FROM entries WHERE day = ?`,
        day,
      )
      .one();
    const capUsd = dailyCapUsd(this.env);
    const spentUsd = row.spent ?? 0;
    const reservedUsd = row.reserved ?? 0;
    return {
      day,
      capUsd,
      spentUsd,
      reservedUsd,
      open: spentUsd + reservedUsd + needUsd <= capUsd + 1e-9,
    };
  }

  /** Reserves the worst case of a run (its key is the run id and attempt); a second call changes nothing. */
  async reserve(key: string, usd: number): Promise<SpendStatus> {
    this.ctx.storage.sql.exec(
      "INSERT INTO entries (key, day, reserved_usd) VALUES (?, ?, ?) ON CONFLICT (key) DO NOTHING",
      key,
      today(),
      usd,
    );
    this.prune();
    return this.status();
  }

  /**
   * Replaces a reservation with the real spend, on the day of the reservation; without a
   * reservation (a classification), records the spend today. Settling twice keeps the last amount.
   */
  async settle(key: string, usd: number): Promise<SpendStatus> {
    this.ctx.storage.sql.exec(
      `INSERT INTO entries (key, day, reserved_usd, spent_usd, settled) VALUES (?, ?, 0, ?, 1)
       ON CONFLICT (key) DO UPDATE SET spent_usd = excluded.spent_usd, settled = 1`,
      key,
      today(),
      usd,
    );
    this.prune();
    return this.status();
  }

  private prune(): void {
    const oldest = new Date(Date.now() - KEEP_DAYS * 86_400_000).toISOString().slice(0, 10);
    this.ctx.storage.sql.exec("DELETE FROM entries WHERE day < ?", oldest);
  }
}
