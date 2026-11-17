import type { CallLedger, LedgerEntry } from "@chebot/driver";
import type {
  LoggedEvent,
  ModelSnapshot,
  QuestionClass,
  RunEvent,
  RunState,
  Snapshot,
} from "@chebot/protocol";

// The SQLite storage of one RunObject: the run, its event log, its document versions and the
// ledger of its model calls. Every method is synchronous (the storage API is); the caller groups
// writes in `transactionSync` where they must land together.

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS run (
     id TEXT PRIMARY KEY,
     owner TEXT NOT NULL,
     question TEXT NOT NULL,
     class TEXT NOT NULL,
     probability REAL,
     amount REAL NOT NULL,
     currency TEXT NOT NULL,
     status TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     pay_requested_at INTEGER,
     paid_at INTEGER,
     hook_token TEXT,
     models TEXT,
     budget_usd REAL,
     deadline_at INTEGER,
     attempt INTEGER NOT NULL DEFAULT 0,
     state TEXT
   )`,
  `CREATE TABLE IF NOT EXISTS events (
     seq INTEGER PRIMARY KEY,
     key TEXT NOT NULL UNIQUE,
     batch INTEGER NOT NULL,
     type TEXT NOT NULL,
     at INTEGER NOT NULL,
     data TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS calls (
     key TEXT PRIMARY KEY,
     status TEXT NOT NULL,
     attempts INTEGER NOT NULL DEFAULT 0,
     started_at INTEGER,
     finished_at INTEGER,
     entry TEXT,
     cost_usd REAL
   )`,
  `CREATE TABLE IF NOT EXISTS snapshots (
     version INTEGER PRIMARY KEY,
     doc TEXT NOT NULL,
     seq INTEGER NOT NULL
   )`,
];

/** Where a run is: before payment, running, or ended. */
export type RunStatus =
  | "quoted"
  | "awaiting_payment"
  | "running"
  | "completed"
  | "failed"
  | "expired";

export interface RunRecord {
  id: string;
  owner: string;
  question: string;
  class: QuestionClass;
  probability: number | null;
  amount: number;
  currency: string;
  status: RunStatus;
  createdAt: number;
  payRequestedAt: number | null;
  paidAt: number | null;
  hookToken: string | null;
  /** The model snapshot, resolved once when the run is paid. */
  models: ModelSnapshot | null;
  budgetUsd: number | null;
  deadlineAt: number | null;
  /** 0 before the run starts; 1 for the paid run; a free rerun adds one. */
  attempt: number;
  /** The protocol state of the current attempt. */
  state: RunState | null;
}

interface RunRow extends Record<string, SqlStorageValue> {
  id: string;
  owner: string;
  question: string;
  class: string;
  probability: number | null;
  amount: number;
  currency: string;
  status: string;
  created_at: number;
  pay_requested_at: number | null;
  paid_at: number | null;
  hook_token: string | null;
  models: string | null;
  budget_usd: number | null;
  deadline_at: number | null;
  attempt: number;
  state: string | null;
}

/** The columns of the run row that `updateRun` may set. */
export type RunUpdate = Partial<Omit<RunRow, "id" | "owner" | "question" | "created_at">>;

/**
 * The keys of an attempt: the first keeps the keys of the protocol, a free rerun prefixes its
 * event and call keys with "a2:", so they never collide with the attempt before it.
 */
export function attemptPrefix(attempt: number): string {
  return attempt > 1 ? `a${attempt}:` : "";
}

export class RunStore {
  private created = false;

  constructor(private readonly sql: SqlStorage) {}

  /** Whether the tables exist; reading never creates them, so an unknown run stores nothing. */
  exists(): boolean {
    if (this.created) return true;
    this.created =
      this.sql
        .exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'run'")
        .toArray().length > 0;
    return this.created;
  }

  create(): void {
    for (const statement of SCHEMA) this.sql.exec(statement);
    this.created = true;
  }

  /** After `deleteAll`, the tables are gone. */
  forget(): void {
    this.created = false;
  }

  run(): RunRecord | null {
    if (!this.exists()) return null;
    const row = this.sql.exec<RunRow>("SELECT * FROM run LIMIT 1").toArray()[0];
    if (!row) return null;
    return {
      id: row.id,
      owner: row.owner,
      question: row.question,
      class: row.class as QuestionClass,
      probability: row.probability,
      amount: row.amount,
      currency: row.currency,
      status: row.status as RunStatus,
      createdAt: row.created_at,
      payRequestedAt: row.pay_requested_at,
      paidAt: row.paid_at,
      hookToken: row.hook_token,
      models: row.models ? (JSON.parse(row.models) as ModelSnapshot) : null,
      budgetUsd: row.budget_usd,
      deadlineAt: row.deadline_at,
      attempt: row.attempt,
      state: row.state ? (JSON.parse(row.state) as RunState) : null,
    };
  }

  insertRun(run: {
    id: string;
    owner: string;
    question: string;
    class: QuestionClass;
    probability: number | null;
    amount: number;
    currency: string;
    createdAt: number;
  }): void {
    this.sql.exec(
      `INSERT INTO run (id, owner, question, class, probability, amount, currency, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'quoted', ?)`,
      run.id,
      run.owner,
      run.question,
      run.class,
      run.probability,
      run.amount,
      run.currency,
      run.createdAt,
    );
  }

  updateRun(update: RunUpdate): void {
    const columns = Object.entries(update).filter(([, value]) => value !== undefined);
    if (!columns.length) return;
    this.sql.exec(
      `UPDATE run SET ${columns.map(([column]) => `${column} = ?`).join(", ")}`,
      ...columns.map(([, value]) => value as SqlStorageValue),
    );
  }

  /**
   * Appends events with the keys of the attempt: assigns `seq` and `at`, skips an event whose key
   * is already in the log (appending twice is a no-op), and stores the document of each
   * `document.seeded` and `snapshot.created` by its version. Returns what was appended.
   */
  append(events: readonly RunEvent[], at: number, prefix = ""): LoggedEvent[] {
    const appended: LoggedEvent[] = [];
    for (const event of events) {
      const stored = { ...event, key: `${prefix}${event.key}` } as RunEvent;
      const row = this.sql
        .exec<{ seq: number }>(
          `INSERT INTO events (key, batch, type, at, data) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (key) DO NOTHING RETURNING seq`,
          stored.key,
          stored.batch,
          stored.type,
          at,
          JSON.stringify(stored),
        )
        .toArray()[0];
      if (!row) continue;
      appended.push({ ...stored, seq: row.seq, at });
      if (stored.type === "document.seeded" || stored.type === "snapshot.created")
        this.sql.exec(
          "INSERT OR IGNORE INTO snapshots (version, doc, seq) VALUES (?, ?, ?)",
          stored.snapshot.version,
          JSON.stringify(stored.snapshot),
          row.seq,
        );
    }
    return appended;
  }

  /** The events after `after`, in order. */
  events(after = 0, limit = -1): LoggedEvent[] {
    return this.sql
      .exec<{ seq: number; at: number; data: string }>(
        "SELECT seq, at, data FROM events WHERE seq > ? ORDER BY seq LIMIT ?",
        after,
        limit,
      )
      .toArray()
      .map((row) => ({ ...(JSON.parse(row.data) as RunEvent), seq: row.seq, at: row.at }));
  }

  lastSeq(): number {
    return (
      this.sql.exec<{ seq: number | null }>("SELECT MAX(seq) AS seq FROM events").one().seq ?? 0
    );
  }

  snapshot(version: number): Snapshot | null {
    const row = this.sql
      .exec<{ doc: string }>("SELECT doc FROM snapshots WHERE version = ?", version)
      .toArray()[0];
    return row ? (JSON.parse(row.doc) as Snapshot) : null;
  }

  lastVersion(): number | null {
    return this.sql
      .exec<{ version: number | null }>("SELECT MAX(version) AS version FROM snapshots")
      .one().version;
  }

  /** The versions of a failed attempt, before a rerun writes its own. */
  clearSnapshots(): void {
    this.sql.exec("DELETE FROM snapshots");
  }

  /**
   * The call ledger of an attempt. A row is written before each request ("started", with the
   * number of attempts) and completed when its result lands, each call on its own; a row still
   * "started" when a tick reads it is a call that a restart cut short.
   */
  ledger(prefix: string): CallLedger {
    const sql = this.sql;
    return {
      get: async (key) => {
        const row = sql
          .exec<{ entry: string | null }>(
            "SELECT entry FROM calls WHERE key = ? AND entry IS NOT NULL",
            `${prefix}${key}`,
          )
          .toArray()[0];
        return row?.entry ? (JSON.parse(row.entry) as LedgerEntry) : undefined;
      },
      begin: async (key, at) => {
        const row = sql
          .exec<{ attempts: number }>(
            `INSERT INTO calls (key, status, attempts, started_at) VALUES (?, 'started', 1, ?)
             ON CONFLICT (key) DO UPDATE SET attempts = attempts + 1, started_at = excluded.started_at
             RETURNING attempts`,
            `${prefix}${key}`,
            at,
          )
          .one();
        return row.attempts - 1;
      },
      put: async (key, entry) => {
        sql.exec(
          `INSERT INTO calls (key, status, attempts, finished_at, entry, cost_usd)
           VALUES (?, ?, 1, ?, ?, ?)
           ON CONFLICT (key) DO UPDATE SET status = excluded.status,
             finished_at = excluded.finished_at, entry = excluded.entry, cost_usd = excluded.cost_usd`,
          `${prefix}${key}`,
          entry.result.status,
          Date.now(),
          JSON.stringify(entry),
          entry.result.costUsd,
        );
      },
    };
  }

  /** The rows of the call ledger, for tests and diagnostics. */
  calls(): { key: string; status: string; attempts: number }[] {
    return this.sql
      .exec<{ key: string; status: string; attempts: number }>(
        "SELECT key, status, attempts FROM calls ORDER BY key",
      )
      .toArray();
  }
}
