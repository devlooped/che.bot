import type { CallLedger, LedgerEntry } from "@chebot/driver";
import type {
  LoggedEvent,
  ModelSnapshot,
  QuestionClass,
  RunEvent,
  RunState,
  Snapshot,
  Stage,
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
     hook_url TEXT,
     free INTEGER NOT NULL DEFAULT 0,
     job_enqueued_at INTEGER,
     job_closed TEXT,
     retries INTEGER NOT NULL DEFAULT 0,
     reserved_attempt INTEGER NOT NULL DEFAULT 0,
     settled_attempt INTEGER NOT NULL DEFAULT 0,
     models TEXT,
     budget_usd REAL,
     deadline_at INTEGER,
     attempt INTEGER NOT NULL DEFAULT 0,
     state TEXT,
     classify TEXT
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

/** The classification of the question, made before the run: what it cost. */
export interface ClassifyCost {
  model: string;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
}

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
  /** The secret the jobs service sends to the payment hook of this run. */
  hookToken: string | null;
  /** Where the jobs service calls when the payment is processed. */
  hookUrl: string | null;
  /** An admin run: no payment job. */
  free: boolean;
  /** When the payment job was enqueued. */
  jobEnqueuedAt: number | null;
  /** How the payment job ended: cancelled (expired), done or failed (the run's outcome). */
  jobClosed: "cancelled" | "done" | "failed" | null;
  /** Failed calls to the outside (jobs service, settings, meter) in a row, for the backoff. */
  retries: number;
  /** The last attempt whose worst case is reserved in the SpendMeter, and the last settled. */
  reservedAttempt: number;
  settledAttempt: number;
  /** The model snapshot, resolved once when the run is paid. */
  models: ModelSnapshot | null;
  budgetUsd: number | null;
  deadlineAt: number | null;
  /** 0 before the run starts; 1 for the paid run; a free rerun adds one. */
  attempt: number;
  /** The protocol state of the current attempt. */
  state: RunState | null;
  /** What the classification cost; null when it was not recorded. */
  classify: ClassifyCost | null;
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
  hook_url: string | null;
  free: number;
  job_enqueued_at: number | null;
  job_closed: string | null;
  retries: number;
  reserved_attempt: number;
  settled_attempt: number;
  models: string | null;
  budget_usd: number | null;
  deadline_at: number | null;
  attempt: number;
  state: string | null;
  /** Absent (undefined) in the rows of objects created before the spend was shown. */
  classify: string | null;
}

/** The columns of the run row that `updateRun` may set. */
export type RunUpdate = Partial<
  Omit<RunRow, "id" | "owner" | "question" | "created_at" | "classify">
>;

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
      hookUrl: row.hook_url,
      free: row.free === 1,
      jobEnqueuedAt: row.job_enqueued_at,
      jobClosed: row.job_closed as RunRecord["jobClosed"],
      retries: row.retries,
      reservedAttempt: row.reserved_attempt,
      settledAttempt: row.settled_attempt,
      models: row.models ? (JSON.parse(row.models) as ModelSnapshot) : null,
      budgetUsd: row.budget_usd,
      deadlineAt: row.deadline_at,
      attempt: row.attempt,
      state: row.state ? (JSON.parse(row.state) as RunState) : null,
      classify: row.classify ? (JSON.parse(row.classify) as ClassifyCost) : null,
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
    classify?: ClassifyCost | null;
  }): void {
    this.sql.exec(
      `INSERT INTO run (id, owner, question, class, probability, amount, currency, status, created_at, classify)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'quoted', ?, ?)`,
      run.id,
      run.owner,
      run.question,
      run.class,
      run.probability,
      run.amount,
      run.currency,
      run.createdAt,
      run.classify ? JSON.stringify(run.classify) : null,
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

  /** Whether the log holds the event of `key`. */
  hasEvent(key: string): boolean {
    return this.sql.exec("SELECT 1 FROM events WHERE key = ?", key).toArray().length > 0;
  }

  lastSeq(): number {
    return (
      this.sql.exec<{ seq: number | null }>("SELECT MAX(seq) AS seq FROM events").one().seq ?? 0
    );
  }

  /** The stage of the last `stage.changed` event: the step in flight, before its state is stored. */
  lastStage(): Stage | null {
    const row = this.sql
      .exec<{ data: string }>(
        "SELECT data FROM events WHERE type = 'stage.changed' ORDER BY seq DESC LIMIT 1",
      )
      .toArray()[0];
    return row ? (JSON.parse(row.data) as { stage: Stage }).stage : null;
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

  /** Every call of the ledger, of every attempt, with its entry once it finished. */
  spendCalls(): { key: string; entry: LedgerEntry | null }[] {
    return this.sql
      .exec<{ key: string; entry: string | null }>("SELECT key, entry FROM calls ORDER BY key")
      .toArray()
      .map((row) => ({
        key: row.key,
        entry: row.entry ? (JSON.parse(row.entry) as LedgerEntry) : null,
      }));
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
