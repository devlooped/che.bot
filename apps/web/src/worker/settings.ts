import type { ModelSnapshot, QuestionClass } from "@chebot/protocol";
import { type ModelSetting, resolveModels } from "@chebot/providers";
import { deps } from "./deps.ts";
import type { Env } from "./env.ts";

// The D1 side: model settings, prices and the list of runs.

export async function readModelSettings(db: D1Database): Promise<ModelSetting[]> {
  const { results } = await db
    .prepare("SELECT role, model_id, effort FROM model_settings")
    .all<{ role: string; model_id: string; effort: string | null }>();
  return results.map((row) => ({ role: row.role, modelId: row.model_id, effort: row.effort }));
}

/**
 * The concrete models of a new run: every role's setting (a family) resolved to the newest model
 * of that family in the Gateway catalog. Called once per run, when it is paid; the run keeps it.
 */
export async function resolveRunModels(env: Env): Promise<ModelSnapshot> {
  const [settings, catalog] = await Promise.all([readModelSettings(env.DB), deps.catalog(env)]);
  return resolveModels(settings, catalog);
}

export interface Price {
  class: QuestionClass;
  amount: number;
  currency: string;
}

export async function readPrices(db: D1Database): Promise<Price[]> {
  const { results } = await db
    .prepare("SELECT class, amount, currency FROM prices ORDER BY amount")
    .all<Price>();
  return results;
}

export async function priceOf(db: D1Database, cls: QuestionClass): Promise<Price> {
  const price = await db
    .prepare("SELECT class, amount, currency FROM prices WHERE class = ?")
    .bind(cls)
    .first<Price>();
  if (!price) throw new Error(`No price for the class ${cls}.`);
  return price;
}

/** A row of the list of runs. */
export interface RunListItem {
  id: string;
  createdAt: string;
  question: string;
  class: QuestionClass | null;
  status: string;
  amount: number | null;
}

/** Adds a run to the list once; a second call changes nothing. */
export async function indexRun(
  db: D1Database,
  run: {
    id: string;
    owner: string;
    createdAt: number;
    question: string;
    class: QuestionClass;
    status: string;
    amount: number;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO runs (id, owner, created_at, question, class, status, amount)
       VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING`,
    )
    .bind(
      run.id,
      run.owner,
      new Date(run.createdAt).toISOString(),
      run.question,
      run.class,
      run.status,
      run.amount,
    )
    .run();
}

export async function setRunStatus(db: D1Database, id: string, status: string): Promise<void> {
  await db.prepare("UPDATE runs SET status = ? WHERE id = ?").bind(status, id).run();
}

export async function removeRun(db: D1Database, id: string): Promise<void> {
  await db.prepare("DELETE FROM runs WHERE id = ?").bind(id).run();
}

/** The runs of an owner, newest first. */
export async function listRuns(db: D1Database, owner: string): Promise<RunListItem[]> {
  const { results } = await db
    .prepare(
      `SELECT id, created_at, question, class, status, amount FROM runs
       WHERE owner = ? ORDER BY created_at DESC, id`,
    )
    .bind(owner)
    .all<{
      id: string;
      created_at: string;
      question: string;
      class: QuestionClass | null;
      status: string;
      amount: number | null;
    }>();
  return results.map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    question: row.question,
    class: row.class,
    status: row.status,
    amount: row.amount,
  }));
}
