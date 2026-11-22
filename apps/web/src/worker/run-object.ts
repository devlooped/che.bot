import { DurableObject } from "cloudflare:workers";
import { checkSnapshot, modelFor, runCalls } from "@chebot/driver";
import {
  beginStep,
  chartIds,
  createRun,
  expiredEvent,
  type FailureReason,
  failRun,
  type LoggedEvent,
  linkOf,
  nextStep,
  type OutputOf,
  paymentConfirmedEvent,
  paymentRequestedEvent,
  type QuestionClass,
  quaranSeconds,
  quotedEvent,
  type RunEvent,
  type RunState,
  reduce,
  resolveConfig,
  runUuid,
  SLUG_WORDS,
  type Snapshot,
  type Stage,
  shortOf,
  slugOf,
  slugPrompt,
  slugSchema,
} from "@chebot/protocol";
import { ProviderError } from "@chebot/providers";
import { deps } from "./deps.ts";
import type { Env } from "./env.ts";
import { type JobSnapshot, JobsError } from "./jobs.ts";
import {
  attemptPrefix,
  type CallCost,
  type RunRecord,
  type RunStatus,
  RunStore,
} from "./run-store.ts";
import {
  claimLink,
  indexRun,
  removeRun,
  resolveRunModels,
  retireReplaced,
  setRunStatus,
} from "./settings.ts";
import { type RunSpend, type SpendCall, spendOf, stageOfKey } from "./spend.ts";
import { spendMeter } from "./spend-meter.ts";

/** Runs of the alarm handler for one tick before the run fails ("error"). */
export const ALARM_ATTEMPTS = 3;
/** The paid attempt and one free rerun after it fails. */
export const MAX_ATTEMPTS = 2;
/** A job not paid in this time is cancelled and the run expires. */
export const PAYMENT_WINDOW_MS = 15 * 60_000;
/** The wait between two reads of a job whose QR is not ready. */
export const QR_POLL_MS = 2_000;
/** After this many failed tries in a row, the job and the spend of an ended run are left as they are. */
export const CLOSE_ATTEMPTS = 10;

/** The Mercado Pago title of the payment, by class (at most 30 characters). */
const JOB_NAMES: Record<QuestionClass, string> = {
  simple: "che.bot: pregunta simple",
  complex: "che.bot: pregunta compleja",
};

/** The message of the job when the run ends. */
const JOB_MESSAGES = {
  done: "La respuesta está lista.",
  failed: "La corrida falló; se puede volver a correr gratis.",
} as const;

/** The helper's calls for the link of a run, at most: one per tick until a link is claimed. */
export const LINK_TRIES = 3;
/** A call of the helper gives up after this long; the next tick tries again. */
export const HELPER_TIMEOUT_MS = 30_000;
/**
 * The seconds a link tries after the one its question was asked in, when another question of
 * that second has the same words.
 */
export const LINK_SECONDS = 3;

/** The wait before the next try after `retries` failed tries in a row: 2 s doubling, at most 5 min. */
export const backoffMs = (retries: number) => Math.min(2_000 * 2 ** retries, 300_000);

export interface QuoteInput {
  /** A UUID: the name of the object, and later the id of the payment job. */
  id: string;
  owner: string;
  question: string;
  class: QuestionClass;
  /** The probability of the classifier's choice; null when it gave none. */
  probability: number | null;
  amount: number;
  currency: string;
  /** What the classification of the question cost, for the spend of the run. */
  classify?: CallCost | null;
}

export interface PayInput {
  /** The URL the jobs service calls when the payment is processed (POST /api/pay/hook). */
  hookUrl: string;
  /** An admin run: it starts at once, with no payment job. */
  free: boolean;
}

export type PayResult =
  | { ok: true; summary: RunSummary }
  | { ok: false; reason: "not_found" | "daily_cap" };

export type HookResult = "ok" | "not_found" | "forbidden" | "conflict";

/** What GET /api/runs/:id answers. */
export interface RunSummary {
  id: string;
  question: string;
  class: QuestionClass;
  amount: number;
  currency: string;
  status: RunStatus;
  stage: Stage | null;
  /** The latest document version, or null before the document exists. */
  version: number | null;
  lastSeq: number;
  attempt: number;
  createdAt: number;
  failure: FailureReason | null;
  /** How many charts the answer has (0 before they are decided, or when it has none). */
  charts: number;
  /** The public link (run-link.ts of the protocol), once the helper named the run. */
  link: string | null;
}

export type RerunResult =
  | { ok: true; summary: RunSummary }
  | { ok: false; reason: "not_found" | "not_failed" | "not_paid" | "no_attempts_left" };

interface Attachment {
  /** The last seq sent on this socket. */
  sent: number;
}

/** A random secret: 32 bytes, base64url. */
function newSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Compares two secrets in constant time (their SHA-256, so that the length does not show either). */
async function sameSecret(given: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(given)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  return crypto.subtle.timingSafeEqual(a, b);
}

/**
 * Whether a job shows that the payment went through: the service calls the hook only after the
 * payment, then the job is queued, or failed when the hook did not answer 2xx.
 */
function paidByJob(job: JobSnapshot): boolean {
  if (job.status === "queued" || job.status === "running" || job.status === "done") return true;
  return job.status === "failed" && /^Automation /.test(job.message ?? "");
}

/** The object of a run: one per question, named by the run id. */
export function runStub(env: Env, id: string) {
  return env.RUNS.get(env.RUNS.idFromName(runUuid(id) ?? id));
}

/**
 * One question: its payment, its protocol run and its event stream. The run goes on by itself on
 * the object's one alarm, with no HTTP request open: the alarm waits for the QR and the payment
 * window while the run awaits payment, runs one stage per tick while it runs, and closes the job
 * and the spend after it ends. Browsers follow it over hibernatable WebSockets.
 */
export class RunObject extends DurableObject<Env> {
  private readonly store = new RunStore(this.ctx.storage.sql);

  // -------------------------------------------------------------------------------------------
  // Before the run: quote, pay, paid, the payment hook. Each is safe to call twice.

  /** Creates the run once, with its class and price (the classification is the caller's). */
  async quote(input: QuoteInput): Promise<RunSummary> {
    const now = Date.now();
    this.ctx.storage.transactionSync(() => {
      if (this.store.run()) return;
      this.store.create();
      this.store.insertRun({ ...input, createdAt: now });
      this.store.append(
        [
          quotedEvent({
            class: input.class,
            probability: input.probability ?? 0,
            amount: input.amount,
            currency: input.currency,
          }),
        ],
        now,
      );
    });
    const run = this.requireRun();
    await indexRun(this.env.DB, { ...run, status: run.status });
    return this.summarize(run);
  }

  /**
   * The owner asks to pay. A quoted run is refused when the daily cap has no room for its worst
   * case; otherwise it waits for payment, and the first alarm enqueues the job and waits for its
   * QR. An admin run (`free`) starts at once, with no job. On any other status nothing changes.
   */
  async pay(input: PayInput): Promise<PayResult> {
    const run = this.store.run();
    if (!run) return { ok: false, reason: "not_found" };
    if (run.status !== "quoted") return { ok: true, summary: this.summarize(run) };
    const budget = resolveConfig(deps.runConfig(this.env)).budgetUsd;
    if (!(await spendMeter(this.env).status(budget)).open)
      return { ok: false, reason: "daily_cap" };
    const changed = this.ctx.storage.transactionSync(() => {
      if (this.store.run()?.status !== "quoted") return false;
      this.store.updateRun({
        status: "awaiting_payment",
        pay_requested_at: Date.now(),
        free: input.free ? 1 : 0,
        hook_token: input.free ? null : newSecret(),
        hook_url: input.free ? null : input.hookUrl,
        retries: 0,
      });
      return true;
    });
    if (changed) {
      await this.index("awaiting_payment");
      if (input.free) await this.startOrRetry();
      else await this.ctx.storage.setAlarm(Date.now());
    }
    return { ok: true, summary: this.summarize(this.requireRun()) };
  }

  /**
   * The payment is confirmed: records it first (payment.confirmed), then resolves the model
   * snapshot and starts the run. If the start fails, the payment stays recorded and the alarm
   * tries again. A second call, or a call on a run that is not waiting for payment, changes
   * nothing.
   */
  async paid(): Promise<RunSummary | null> {
    const recorded = this.ctx.storage.transactionSync(() => {
      const run = this.store.run();
      if (run?.status !== "awaiting_payment" || run.free || run.paidAt !== null) return false;
      const now = Date.now();
      this.store.append(
        [paymentConfirmedEvent({ amount: run.amount, currency: run.currency })],
        now,
      );
      this.store.updateRun({ paid_at: now, retries: 0 });
      return true;
    });
    if (recorded) this.broadcast();
    await this.startOrRetry();
    return this.summary();
  }

  /**
   * POST /api/pay/hook: the jobs service says that the payment was processed, with the token of
   * this run. The token is compared in constant time; a repeated call answers "ok" and changes
   * nothing.
   */
  async hook(token: string): Promise<HookResult> {
    const run = this.store.run();
    if (!run) return "not_found";
    if (!run.hookToken || !(await sameSecret(token, run.hookToken))) return "forbidden";
    if (run.status === "awaiting_payment") {
      await this.paid();
      return "ok";
    }
    return run.paidAt !== null ? "ok" : "conflict";
  }

  /** A paid run, or an admin run, that has not started yet. */
  private ready(run: RunRecord | null): boolean {
    return run?.status === "awaiting_payment" && (run.free || run.paidAt !== null);
  }

  /** A run that waits for its payment and has not had it. */
  private waiting(): boolean {
    const run = this.store.run();
    return run?.status === "awaiting_payment" && !run.free && run.paidAt === null;
  }

  /** Starts a run that is ready; on a failure (the catalog, D1), the alarm tries again later. */
  private async startOrRetry(): Promise<void> {
    if (!this.ready(this.store.run())) return;
    try {
      const models = await resolveRunModels(this.env);
      checkSnapshot(models);
      const config = deps.runConfig(this.env);
      const started = this.ctx.storage.transactionSync(() => {
        const run = this.store.run();
        if (!run || !this.ready(run)) return false;
        const now = Date.now();
        const created = createRun(
          {
            id: run.id,
            question: run.question,
            mode: "thorough",
            models,
            config,
          },
          now,
        );
        this.store.append(created.events, now);
        this.store.updateRun({
          status: "running",
          models: JSON.stringify(models),
          budget_usd: created.state.config.budgetUsd,
          deadline_at: created.state.deadlineAt,
          attempt: 1,
          state: JSON.stringify(created.state),
          retries: 0,
        });
        return true;
      });
      if (started) {
        await this.started();
        // A question asked again from the page of an older run takes its place now that it runs.
        await retireReplaced(this.env.DB, this.requireRun().id).catch((error: unknown) => {
          console.warn("The run this one replaces could not be deleted.", error);
        });
      }
    } catch (error) {
      console.error("A run that may start could not start; it is tried again.", error);
      await this.retryLater();
    }
  }

  /**
   * Waiting for payment, one alarm at a time: expire the run after the payment window; enqueue
   * the job once; read it until its QR appears and emit payment.requested once; then sleep until
   * the window ends (the hook wakes the run before). A failed call is tried again with backoff.
   */
  private async paymentTick(run: RunRecord): Promise<void> {
    if (this.ready(run)) return this.startOrRetry();
    try {
      const expiresAt = (run.payRequestedAt ?? 0) + PAYMENT_WINDOW_MS;
      if (Date.now() >= expiresAt) return await this.expire(run, true);
      const jobs = deps.jobs(this.env);
      if (run.jobEnqueuedAt === null) {
        if (!run.hookUrl || !run.hookToken) throw new Error("The run has no payment hook.");
        try {
          await jobs.enqueue({
            id: run.id,
            actor: run.owner,
            name: JOB_NAMES[run.class],
            amount: run.amount,
            currency: run.currency,
            hook: { url: run.hookUrl, token: run.hookToken },
          });
        } catch (error) {
          if (!(error instanceof JobsError && error.permanent)) throw error;
          // The service refuses the job for good (a wrong token, a hook that is not https):
          // nothing can be paid, so the run expires now.
          console.error(`The payment job of run ${run.id} was refused.`, error);
          return await this.expire(run, false);
        }
        this.store.updateRun({ job_enqueued_at: Date.now() });
      }
      if (!this.store.hasEvent("payment.requested")) {
        const job = await jobs.get(run.id);
        // The hook may have started the run while the service answered.
        if (!this.waiting()) return;
        if (job.status === "pending" && job.qr) {
          this.store.append(
            [paymentRequestedEvent({ amount: run.amount, currency: run.currency, qr: job.qr })],
            Date.now(),
          );
          this.broadcast();
        } else if (job.status === "failed" && !paidByJob(job)) {
          console.error(`The payment job of run ${run.id} failed: ${job.message}`);
          return await this.expire(run, false);
        } else {
          // "created": the QR is being made. Queued or later: paid, the hook is on its way.
          this.store.updateRun({ retries: 0 });
          await this.ctx.storage.setAlarm(Math.min(Date.now() + QR_POLL_MS, expiresAt));
          return;
        }
      }
      if (!this.waiting()) return;
      this.store.updateRun({ retries: 0 });
      await this.ctx.storage.setAlarm(expiresAt);
    } catch (error) {
      console.error(`The payment of run ${run.id} could not go on; it is tried again.`, error);
      await this.retryLater();
    }
  }

  /**
   * Ends a run that was not paid (run.expired), after cancelling its job when it has one. A job
   * that can no longer be cancelled because it was paid starts the run instead.
   */
  private async expire(run: RunRecord, cancel: boolean): Promise<void> {
    if (cancel) {
      const jobs = deps.jobs(this.env);
      try {
        await jobs.cancel(run.id);
      } catch (error) {
        if (!(error instanceof JobsError && error.status === 409)) throw error;
        if (paidByJob(await jobs.get(run.id))) {
          await this.paid();
          return;
        }
      }
    }
    const expired = this.ctx.storage.transactionSync(() => {
      const current = this.store.run();
      if (current?.status !== "awaiting_payment" || current.paidAt !== null) return false;
      this.store.append([expiredEvent()], Date.now());
      this.store.updateRun({ status: "expired", job_closed: cancel ? "cancelled" : null });
      return true;
    });
    if (expired) {
      this.broadcast();
      await this.index("expired");
    }
  }

  /**
   * Runs a paid question that failed once more, free: the same question and model snapshot, a new
   * attempt whose event and call keys do not collide with the first. The caller checks that the
   * owner asks.
   */
  async rerun(): Promise<RerunResult> {
    const result = this.ctx.storage.transactionSync((): RerunResult => {
      const run = this.store.run();
      if (!run) return { ok: false, reason: "not_found" };
      if (run.status !== "failed") return { ok: false, reason: "not_failed" };
      if (run.paidAt === null || !run.models) return { ok: false, reason: "not_paid" };
      if (run.attempt >= MAX_ATTEMPTS) return { ok: false, reason: "no_attempts_left" };
      const now = Date.now();
      const attempt = run.attempt + 1;
      const created = createRun(
        {
          id: run.id,
          question: run.question,
          mode: "thorough",
          models: run.models,
          config: {
            ...deps.runConfig(this.env),
            ...(run.budgetUsd !== null ? { budgetUsd: run.budgetUsd } : {}),
          },
        },
        now,
      );
      this.store.clearSnapshots();
      this.store.append(created.events, now, attemptPrefix(attempt));
      this.store.updateRun({
        status: "running",
        attempt,
        deadline_at: created.state.deadlineAt,
        state: JSON.stringify(created.state),
        retries: 0,
      });
      return { ok: true, summary: this.summarize(this.requireRun()) };
    });
    if (result.ok) await this.started();
    return result;
  }

  /** An attempt started: its first tick, its worst case reserved in the SpendMeter, the list. */
  private async started(): Promise<void> {
    await this.schedule();
    await this.reserve();
    await this.index("running");
    this.broadcast();
  }

  /** Reserves the budget of the current attempt once. A paid run is never refused here. */
  private async reserve(): Promise<void> {
    const run = this.store.run();
    if (!run || run.reservedAttempt >= run.attempt) return;
    try {
      await spendMeter(this.env).reserve(
        `${run.id}:${run.attempt}`,
        run.state?.config.budgetUsd ?? run.budgetUsd ?? 0,
      );
      this.store.updateRun({ reserved_attempt: run.attempt });
    } catch (error) {
      console.error(`The spend of run ${run.id} could not be reserved.`, error);
    }
  }

  /** Waits before trying a failed call to the outside again (see `backoffMs`). */
  private async retryLater(): Promise<void> {
    const run = this.store.run();
    if (!run) return;
    this.store.updateRun({ retries: run.retries + 1 });
    await this.ctx.storage.setAlarm(Date.now() + backoffMs(run.retries));
  }

  // -------------------------------------------------------------------------------------------
  // The one alarm: the payment while the run waits for it, one stage per tick while it runs, and
  // the job and the spend after it ends.

  override async alarm(info?: AlarmInvocationInfo): Promise<void> {
    const run = this.store.run();
    if (!run) return;
    if (run.status === "awaiting_payment") return this.paymentTick(run);
    if (run.status === "completed" || run.status === "failed") return this.close();
    if (run.status !== "running" || !run.state) return;
    const retries = info?.retryCount ?? 0;
    if (retries >= ALARM_ATTEMPTS) return this.fail(run, run.state);
    try {
      await this.tick(run, run.state);
    } catch (error) {
      console.error(`The tick of run ${run.id} failed (retry ${retries}).`, error);
      // The runtime retries a handler that throws, with backoff; after the last allowed attempt
      // the run fails instead, and its owner can run it again.
      if (retries + 1 >= ALARM_ATTEMPTS) return this.fail(run, run.state);
      throw error;
    }
  }

  /**
   * One step: the stage and "thinking" events at once, the calls through the ledger (a finished
   * call is reused, see `runCalls`), then the reduced state and its events in one transaction.
   */
  private async tick(run: RunRecord, state: RunState): Promise<void> {
    const prefix = attemptPrefix(run.attempt);
    const step = nextStep(state, Date.now());
    if (step.kind === "done") return;
    this.store.append(beginStep(state, step), Date.now(), prefix);
    this.broadcast();
    // The helper names the question beside the first steps, so the run does not wait for it.
    const [entries] = await Promise.all([
      runCalls(state, step, {
        provider: deps.provider(this.env),
        renderer: deps.renderer(this.env),
        ledger: this.store.ledger(prefix),
        now: Date.now,
      }),
      this.nameRun(run),
    ]);
    const now = Date.now();
    const reduced = reduce(
      state,
      step,
      entries.map((entry) => entry.result),
      now,
    );
    if (!this.commit(run, state, reduced, now)) return;
    if (reduced.state.status === "running") await this.schedule();
    else await this.ended(reduced.state.status);
  }

  /**
   * Gives the run its public link, once: the helper sums the question up in at most five words, and the
   * link of the second it was asked in and those words is claimed in the list of runs, whose index
   * keeps each link to one run; another question of that second with the same words makes it try
   * the next seconds (LINK_SECONDS). A call per tick until a link is claimed, at most LINK_TRIES.
   * The helper's cost goes to the run's spend and the SpendMeter. A run whose models predate the
   * helper gets no link. Never throws: the run's page works by its UUID without it.
   */
  private async nameRun(run: RunRecord): Promise<void> {
    const model = run.models?.helper;
    if (run.link !== null || run.linkTries >= LINK_TRIES || !model) return;
    const tries = run.linkTries + 1;
    this.store.updateRun({ link_tries: tries });
    let words: string | null = null;
    let cost: CallCost;
    try {
      const result = await deps.provider(this.env).generate({
        callKey: `link:${tries}`,
        model,
        ...slugPrompt({ question: run.question, words: SLUG_WORDS }),
        schema: slugSchema,
        maxOutputTokens: 2_000,
        signal: AbortSignal.timeout(HELPER_TIMEOUT_MS),
      });
      words = slugOf(result.output.words);
      cost = { model: model.id, costUsd: result.costUsd, ...result.usage };
    } catch (error) {
      console.warn(`The helper could not name run ${run.id} (try ${tries}).`, error);
      const failure = ProviderError.isInstance(error) ? error : null;
      cost = {
        model: model.id,
        costUsd: failure?.costUsd ?? 0,
        inputTokens: failure?.usage?.inputTokens ?? 0,
        outputTokens: failure?.usage?.outputTokens ?? 0,
      };
    }
    if (cost.costUsd > 0)
      await spendMeter(this.env)
        .settle(`${run.id}:link:${tries}`, cost.costUsd)
        .catch((error: unknown) => {
          console.warn(`The cost of the link of run ${run.id} could not be recorded.`, error);
        });
    const link = words ? await this.claim(run, words) : null;
    // The run may have been deleted while the helper answered.
    const current = this.store.run();
    if (!current) return;
    const before = current.helper;
    this.store.updateRun({
      link,
      helper: JSON.stringify({
        model: model.id,
        costUsd: (before?.costUsd ?? 0) + cost.costUsd,
        inputTokens: (before?.inputTokens ?? 0) + cost.inputTokens,
        outputTokens: (before?.outputTokens ?? 0) + cost.outputTokens,
      } satisfies CallCost),
    });
  }

  /** Claims the first free link of the run's words; null when none is, or D1 fails. */
  private async claim(run: RunRecord, words: string): Promise<string | null> {
    const second = quaranSeconds(run.createdAt);
    try {
      for (let n = 0; n < LINK_SECONDS; n++) {
        const short = shortOf(second + n);
        const link = linkOf(short, words);
        if (await claimLink(this.env.DB, run.id, short, link)) return link;
      }
      console.warn(`Run ${run.id} found every link of its words taken: ${words}`);
    } catch (error) {
      console.error(`The link of run ${run.id} could not be claimed.`, error);
    }
    return null;
  }

  private async fail(run: RunRecord, state: RunState): Promise<void> {
    const now = Date.now();
    if (this.commit(run, state, failRun(state, "error", now), now)) await this.ended("failed");
  }

  private async ended(status: RunStatus): Promise<void> {
    this.store.updateRun({ retries: 0 });
    await this.index(status);
    await this.close();
  }

  /**
   * After an attempt ends: settles its real spend in the SpendMeter, and ends the payment job
   * with the outcome (done, or failed: the owner may run it again free; a free rerun does not
   * touch the job again). Each is done once; a failure is tried again on the alarm, a few times.
   */
  private async close(): Promise<void> {
    const run = this.store.run();
    if (!run || (run.status !== "completed" && run.status !== "failed")) return;
    try {
      if (run.reservedAttempt >= run.attempt && run.settledAttempt < run.attempt) {
        await spendMeter(this.env).settle(`${run.id}:${run.attempt}`, run.state?.spentUsd ?? 0);
        this.store.updateRun({ settled_attempt: run.attempt });
      }
      if (!run.free && run.paidAt !== null && run.jobClosed === null) {
        const outcome = run.status === "completed" ? "done" : "failed";
        await deps.jobs(this.env).finish(run.id, outcome, JOB_MESSAGES[outcome]);
        this.store.updateRun({ job_closed: outcome });
      }
    } catch (error) {
      console.error(`Run ${run.id} could not close its job or its spend.`, error);
      if (run.retries + 1 < CLOSE_ATTEMPTS) await this.retryLater();
    }
  }

  /**
   * Stores a reduced state and its events together, if the run is still at the state the step was
   * computed from (a run deleted or rerun meanwhile is left alone). Sends the events to the
   * browsers.
   */
  private commit(
    run: RunRecord,
    from: RunState,
    reduced: { state: RunState; events: RunEvent[] },
    now: number,
  ): boolean {
    const committed = this.ctx.storage.transactionSync(() => {
      const current = this.store.run();
      if (
        current?.status !== "running" ||
        current.attempt !== run.attempt ||
        current.state?.stepNo !== from.stepNo
      )
        return false;
      this.store.append(reduced.events, now, attemptPrefix(run.attempt));
      this.store.updateRun({
        status: reduced.state.status,
        state: JSON.stringify(reduced.state),
      });
      return true;
    });
    if (committed) this.broadcast();
    return committed;
  }

  private async schedule(): Promise<void> {
    await this.ctx.storage.setAlarm(Date.now() + deps.tickDelayMs);
  }

  /** Keeps the status of the list of runs in D1 up to date; a failure there does not stop the run. */
  private async index(status: RunStatus): Promise<void> {
    const run = this.store.run();
    if (!run) return;
    try {
      await setRunStatus(this.env.DB, run.id, status);
    } catch (error) {
      console.error(`The status of run ${run.id} could not be written to D1.`, error);
    }
  }

  // -------------------------------------------------------------------------------------------
  // Reading, deleting.

  async summary(): Promise<RunSummary | null> {
    const run = this.store.run();
    return run ? this.summarize(run) : null;
  }

  /** The owner of the run, for the checks of the Worker; null when there is no run. */
  async owner(): Promise<string | null> {
    return this.store.run()?.owner ?? null;
  }

  /** The events after `after`, in order; null when there is no run. */
  async events(after = 0, limit = 1000): Promise<LoggedEvent[] | null> {
    if (!this.store.run()) return null;
    return this.store.events(after, limit);
  }

  /**
   * The spend of the run so far, for admins: every call of the ledger (all attempts) and the
   * classification. A call of the step in flight that has not landed counts as running; a call
   * left unfinished by an earlier attempt or a restart cost nothing that was reported.
   */
  async spend(): Promise<RunSpend | null> {
    const run = this.store.run();
    if (!run) return null;
    const calls: SpendCall[] = [];
    if (run.classify)
      calls.push({ agent: "classifier", stage: "classify", running: false, ...run.classify });
    if (run.helper) calls.push({ agent: "helper", stage: "link", running: false, ...run.helper });
    const inFlight = new Map<string, SpendCall>();
    if (run.status === "running" && run.state) {
      const step = nextStep(run.state, Date.now());
      if (step.kind === "calls")
        for (const call of step.calls)
          inFlight.set(`${attemptPrefix(run.attempt)}${call.key}`, {
            agent: call.seat,
            model: modelFor(run.state.models, call.seat).id,
            stage: stageOfKey(call.key),
            running: true,
            costUsd: 0,
            inputTokens: 0,
            outputTokens: 0,
          });
    }
    for (const { key, entry } of this.store.spendCalls()) {
      if (!entry) {
        const running = inFlight.get(key);
        if (running && running.agent !== "renderer") calls.push(running);
        continue;
      }
      if (entry.seat === "renderer") continue; // code, not a model: it costs nothing
      const usage = entry.result.status === "ok" ? entry.result.usage : entry.usage;
      calls.push({
        agent: entry.seat,
        model: entry.model.id,
        stage: stageOfKey(key),
        running: false,
        costUsd: entry.result.costUsd,
        inputTokens: usage?.inputTokens ?? 0,
        outputTokens: usage?.outputTokens ?? 0,
      });
    }
    return spendOf(calls);
  }

  async snapshot(version: number): Promise<Snapshot | null> {
    if (!this.store.run()) return null;
    return this.store.snapshot(version);
  }

  /**
   * The SVG of the chart `block` (c1, c2, c3) at a version: the render the run made of it (the
   * render gate keeps it in the call ledger). Null when there is no such chart or version, or it
   * did not render.
   */
  async chartSvg(block: string, version: number): Promise<string | null> {
    const run = this.store.run();
    const render = run?.state?.charts?.renders.findLast(
      (r) => r.block === block && r.version === version && r.ok,
    );
    if (!run || !render) return null;
    const entry = await this.store.ledger(attemptPrefix(run.attempt)).get(render.call);
    if (entry?.result.status !== "ok") return null;
    const results = (entry.result.output as OutputOf<"render">).results;
    return results.find((r) => r.id === render.result && r.status === "ok")?.svg ?? null;
  }

  /**
   * Deletes the run: its row in the list, then everything the object stores. False when there is
   * none. On the way out, a job still waiting for payment is cancelled and a reservation is
   * settled with what was spent, both best effort.
   */
  async remove(): Promise<boolean> {
    const run = this.store.run();
    if (!run) return false;
    if (run.status === "awaiting_payment" && !run.free && run.paidAt === null)
      await deps
        .jobs(this.env)
        .cancel(run.id)
        .catch((error: unknown) => {
          console.warn(`The job of deleted run ${run.id} could not be cancelled.`, error);
        });
    if (run.reservedAttempt >= run.attempt && run.settledAttempt < run.attempt)
      await spendMeter(this.env)
        .settle(`${run.id}:${run.attempt}`, run.state?.spentUsd ?? 0)
        .catch((error: unknown) => {
          console.warn(`The spend of deleted run ${run.id} could not be settled.`, error);
        });
    await removeRun(this.env.DB, run.id);
    await this.ctx.storage.deleteAlarm();
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.close(1000, "deleted");
      } catch {
        // already closed
      }
    }
    await this.ctx.storage.deleteAll();
    this.store.forget();
    return true;
  }

  private requireRun(): RunRecord {
    const run = this.store.run();
    if (!run) throw new Error("The run does not exist.");
    return run;
  }

  private summarize(run: RunRecord): RunSummary {
    const stage: Stage | null =
      run.status === "quoted" || run.status === "awaiting_payment" || run.status === "expired"
        ? run.status
        : (run.state?.stage ?? (run.status === "running" ? this.store.lastStage() : null));
    return {
      id: run.id,
      question: run.question,
      class: run.class,
      amount: run.amount,
      currency: run.currency,
      status: run.status,
      stage,
      version: this.store.lastVersion(),
      lastSeq: this.store.lastSeq(),
      attempt: run.attempt,
      createdAt: run.createdAt,
      failure: run.state?.failure ?? null,
      // a run state from before the charts of an answer has no `charts`
      charts: run.state?.charts ? chartIds(run.state).length : 0,
      link: run.link,
    };
  }

  // -------------------------------------------------------------------------------------------
  // The event stream: replay after a seq, then live events, over hibernatable WebSockets.

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket")
      return new Response("Expected a WebSocket upgrade.", { status: 426 });
    if (!this.store.run()) return new Response("Not found.", { status: 404 });
    const after = Number(new URL(request.url).searchParams.get("after") ?? 0);
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({
      sent: Number.isSafeInteger(after) && after > 0 ? after : 0,
    } satisfies Attachment);
    this.sendPending(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  /** Sends a socket every event it has not had yet, once and in order, one message per event. */
  private sendPending(ws: WebSocket): void {
    const attachment = (ws.deserializeAttachment() as Attachment | null) ?? { sent: 0 };
    const events = this.store.events(attachment.sent);
    const last = events.at(-1);
    if (!last) return;
    for (const event of events) ws.send(JSON.stringify(event));
    ws.serializeAttachment({ sent: last.seq } satisfies Attachment);
  }

  private broadcast(): void {
    for (const ws of this.ctx.getWebSockets()) {
      try {
        this.sendPending(ws);
      } catch (error) {
        console.warn("An event could not be sent to a browser.", error);
      }
    }
  }
}
