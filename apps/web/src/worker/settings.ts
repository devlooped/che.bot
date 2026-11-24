import type { ModelSnapshot, QuestionClass, RunVerdict } from "@chebot/protocol";
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
  /** The public link; null until the helper named the run. */
  link: string | null;
  /** When its owner deleted it (ISO 8601); null when it is not deleted. */
  deletedAt: string | null;
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

/**
 * Gives the run `id` the public `link`, whose short part is `short`: true, or false when another
 * run has it (the unique index of migration 0002 decides). Claiming the link a run has is a no-op.
 */
export async function claimLink(
  db: D1Database,
  id: string,
  short: string,
  link: string,
): Promise<boolean> {
  try {
    const result = await db
      .prepare("UPDATE runs SET link = ?, short = ? WHERE id = ?")
      .bind(link, short, id)
      .run();
    if (!result.meta.changes) throw new Error(`Run ${id} is not in the list of runs.`);
    return true;
  } catch (error) {
    if (/UNIQUE constraint failed/i.test(String(error))) return false;
    throw error;
  }
}

/** The public link of the run `id`; null before it has one. */
export async function linkOfRun(db: D1Database, id: string): Promise<string | null> {
  const row = await db
    .prepare("SELECT link FROM runs WHERE id = ?")
    .bind(id)
    .first<{ link: string | null }>();
  return row?.link ?? null;
}

/**
 * The run of a link: by the whole link, else by its short part alone (the first run of that
 * second). Null when none has it.
 */
export async function findLink(
  db: D1Database,
  short: string,
  link: string | null,
): Promise<{ id: string; link: string } | null> {
  const row = await db
    .prepare(
      `SELECT id, link FROM runs WHERE link = ?
       UNION ALL
       SELECT * FROM (SELECT id, link FROM runs WHERE short = ? ORDER BY created_at, id LIMIT 1)
       LIMIT 1`,
    )
    .bind(link, short)
    .first<{ id: string; link: string }>();
  return row ?? null;
}

/** Records the version of the picture of the run `id`. */
export async function setRunImage(db: D1Database, id: string, version: string): Promise<void> {
  await db.prepare("UPDATE runs SET image = ? WHERE id = ?").bind(version, id).run();
}

/** Records the verdict of the run `id` (migration 0005), once it completed. */
export async function setRunVerdict(
  db: D1Database,
  id: string,
  verdict: RunVerdict,
): Promise<void> {
  await db
    .prepare("UPDATE runs SET verdict = ? WHERE id = ?")
    .bind(JSON.stringify(verdict), id)
    .run();
}

/** Records the one-sentence summary of the answer of the run `id` (migration 0005). */
export async function setRunTldr(db: D1Database, id: string, tldr: string): Promise<void> {
  await db.prepare("UPDATE runs SET tldr = ? WHERE id = ?").bind(tldr, id).run();
}

/** A verdict as the list keeps it; null when there is none or it is not JSON. */
function verdictOfRow(json: string | null): RunVerdict | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as RunVerdict;
  } catch {
    return null;
  }
}

/** A card of the home page: a question that was asked, its picture, its verdict and its summary. */
export interface PublicRun {
  id: string;
  createdAt: string;
  question: string;
  status: string;
  link: string | null;
  /** The version of its picture; null before it has one. */
  image: string | null;
  /** What the question asks and each model's rating, once it completed; null before. */
  verdict: RunVerdict | null;
  /** The answer in one sentence, once the helper wrote it; null before. */
  tldr: string | null;
  /** The reader asked it: the card offers to ask it again. */
  mine: boolean;
}

/** The statuses of a question that was asked: paid (or an admin's) and started. */
export const ASKED_STATUSES = ["running", "completed", "failed"] as const;

/**
 * The questions that were asked, newest first, except the deleted ones: `limit` of them, before
 * the run `before` when it is given (the last of the page before); `mine`, those of `reader`.
 */
export async function listPublicRuns(
  db: D1Database,
  limit: number,
  before: { createdAt: string; id: string } | null,
  reader: string | null,
): Promise<PublicRun[]> {
  const statuses = ASKED_STATUSES.map(() => "?").join(", ");
  const { results } = await db
    .prepare(
      `SELECT id, created_at, question, status, link, image, verdict, tldr, owner = ? AS mine FROM runs
       WHERE deleted_at IS NULL AND status IN (${statuses})
         ${before ? "AND (created_at < ? OR (created_at = ? AND id > ?))" : ""}
       ORDER BY created_at DESC, id LIMIT ?`,
    )
    .bind(
      reader,
      ...ASKED_STATUSES,
      ...(before ? [before.createdAt, before.createdAt, before.id] : []),
      limit,
    )
    .all<{
      id: string;
      created_at: string;
      question: string;
      status: string;
      link: string | null;
      image: string | null;
      verdict: string | null;
      tldr: string | null;
      /** 1, 0, or null when there is no reader. */
      mine: number | null;
    }>();
  return results.map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    question: row.question,
    status: row.status,
    link: row.link,
    image: row.image,
    verdict: verdictOfRow(row.verdict),
    tldr: row.tldr,
    mine: row.mine === 1,
  }));
}

/** What the preview of a shared link of a run shows (see share.ts); null when it is not listed. */
export interface RunShare {
  id: string;
  question: string;
  status: string;
  link: string | null;
  image: string | null;
  verdict: RunVerdict | null;
  tldr: string | null;
  deleted: boolean;
}

export async function shareOf(db: D1Database, id: string): Promise<RunShare | null> {
  const row = await db
    .prepare(
      "SELECT id, question, status, link, image, verdict, tldr, deleted_at FROM runs WHERE id = ?",
    )
    .bind(id)
    .first<{
      id: string;
      question: string;
      status: string;
      link: string | null;
      image: string | null;
      verdict: string | null;
      tldr: string | null;
      deleted_at: string | null;
    }>();
  return row
    ? {
        id: row.id,
        question: row.question,
        status: row.status,
        link: row.link,
        image: row.image,
        verdict: verdictOfRow(row.verdict),
        tldr: row.tldr,
        deleted: row.deleted_at !== null,
      }
    : null;
}

/** The date and id of a run of the list, for the page after it; null when it is not there. */
export async function cursorOf(
  db: D1Database,
  id: string,
): Promise<{ createdAt: string; id: string } | null> {
  const row = await db
    .prepare("SELECT created_at, id FROM runs WHERE id = ?")
    .bind(id)
    .first<{ created_at: string; id: string }>();
  return row ? { createdAt: row.created_at, id: row.id } : null;
}

export async function removeRun(db: D1Database, id: string): Promise<void> {
  await db.prepare("DELETE FROM runs WHERE id = ?").bind(id).run();
}

/** Who owns a run of the list, and whether they deleted it; null when it is not in the list. */
export interface RunVisibility {
  owner: string;
  deleted: boolean;
  /** The run asked again in its place (migration 0003), whose link the old one leads to. */
  replacedBy: string | null;
}

export async function visibilityOf(db: D1Database, id: string): Promise<RunVisibility | null> {
  const row = await db
    .prepare("SELECT owner, deleted_at, replaced_by FROM runs WHERE id = ?")
    .bind(id)
    .first<{ owner: string; deleted_at: string | null; replaced_by: string | null }>();
  return row
    ? { owner: row.owner, deleted: row.deleted_at !== null, replacedBy: row.replaced_by }
    : null;
}

/**
 * Deletes the run `id` of `owner`, or restores it: the run itself stays as it is. A restored run
 * is no longer replaced. False when the owner has no such run.
 */
export async function setRunDeleted(
  db: D1Database,
  id: string,
  owner: string,
  deleted: boolean,
): Promise<boolean> {
  const result = await db
    .prepare(
      deleted
        ? "UPDATE runs SET deleted_at = COALESCE(deleted_at, ?) WHERE id = ? AND owner = ?"
        : "UPDATE runs SET deleted_at = NULL, replaced_by = NULL WHERE id = ? AND owner = ?",
    )
    .bind(...(deleted ? [new Date().toISOString(), id, owner] : [id, owner]))
    .run();
  return result.meta.changes > 0;
}

/** Records that the new run `id` asks again the question of the run `replaces`. */
export async function setReplaces(db: D1Database, id: string, replaces: string): Promise<void> {
  await db.prepare("UPDATE runs SET replaces = ? WHERE id = ?").bind(replaces, id).run();
}

/**
 * Once the run `id` started, deletes the run it replaces, of the same owner, unless it is deleted
 * already: its link leads to `id` from now on.
 */
export async function retireReplaced(db: D1Database, id: string): Promise<void> {
  await db
    .prepare(
      `UPDATE runs SET deleted_at = ?1, replaced_by = ?2
       WHERE deleted_at IS NULL
         AND id = (SELECT replaces FROM runs WHERE id = ?2)
         AND owner = (SELECT owner FROM runs WHERE id = ?2)`,
    )
    .bind(new Date().toISOString(), id)
    .run();
}

/** The runs of an owner, newest first, the deleted ones included. */
export async function listRuns(db: D1Database, owner: string): Promise<RunListItem[]> {
  const { results } = await db
    .prepare(
      `SELECT id, created_at, question, class, status, amount, link, deleted_at FROM runs
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
      link: string | null;
      deleted_at: string | null;
    }>();
  return results.map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    question: row.question,
    class: row.class,
    status: row.status,
    amount: row.amount,
    link: row.link,
    deletedAt: row.deleted_at,
  }));
}

/** A change of a role: its family and effort, or null to go back to the default. */
export interface ModelSettingChange {
  role: string;
  setting: { family: string; effort: string | null } | null;
}

/** Writes the changes of the admin page together; runs already started keep their snapshot. */
export async function writeModelSettings(
  db: D1Database,
  changes: readonly ModelSettingChange[],
  by: string,
): Promise<void> {
  if (!changes.length) return;
  const now = new Date().toISOString();
  await db.batch(
    changes.map((change) =>
      change.setting === null
        ? db.prepare("DELETE FROM model_settings WHERE role = ?").bind(change.role)
        : db
            .prepare(
              `INSERT INTO model_settings (role, model_id, effort, updated_at, updated_by)
               VALUES (?, ?, ?, ?, ?)
               ON CONFLICT (role) DO UPDATE SET model_id = excluded.model_id,
                 effort = excluded.effort, updated_at = excluded.updated_at,
                 updated_by = excluded.updated_by`,
            )
            .bind(change.role, change.setting.family, change.setting.effort, now, by),
    ),
  );
}

/** Sets the amounts of some classes; the next quote reads them. */
export async function writePrices(
  db: D1Database,
  amounts: readonly { class: QuestionClass; amount: number }[],
): Promise<void> {
  if (!amounts.length) return;
  await db.batch(
    amounts.map((price) =>
      db.prepare("UPDATE prices SET amount = ? WHERE class = ?").bind(price.amount, price.class),
    ),
  );
}
