import { DurableObject } from "cloudflare:workers";
import { checkSnapshot, runCalls } from "@chebot/driver";
import {
  beginStep,
  createRun,
  type FailureReason,
  failRun,
  type LoggedEvent,
  nextStep,
  paymentConfirmedEvent,
  type QuestionClass,
  quotedEvent,
  type RunEvent,
  type RunState,
  reduce,
  type Snapshot,
  type Stage,
} from "@chebot/protocol";
import { deps } from "./deps.ts";
import type { Env } from "./env.ts";
import { attemptPrefix, type RunRecord, type RunStatus, RunStore } from "./run-store.ts";
import { indexRun, removeRun, resolveRunModels, setRunStatus } from "./settings.ts";

/** Runs of the alarm handler for one tick before the run fails ("error"). */
export const ALARM_ATTEMPTS = 3;
/** The paid attempt and one free rerun after it fails. */
export const MAX_ATTEMPTS = 2;

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
}

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
}

export type RerunResult =
  | { ok: true; summary: RunSummary }
  | { ok: false; reason: "not_found" | "not_failed" | "not_paid" | "no_attempts_left" };

interface Attachment {
  /** The last seq sent on this socket. */
  sent: number;
}

/**
 * One question: its payment, its protocol run and its event stream. The run goes on by itself,
 * one stage per alarm, with no HTTP request open; browsers follow it over hibernatable
 * WebSockets.
 */
export class RunObject extends DurableObject<Env> {
  private readonly store = new RunStore(this.ctx.storage.sql);

  // -------------------------------------------------------------------------------------------
  // Before the run: quote, pay, paid. Each is safe to call twice.

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
   * Records that the owner asked to pay. Step 21 enqueues the payment job here (`deps.jobs`) and
   * waits for its QR on alarm ticks; a second call changes nothing.
   */
  async pay(): Promise<RunSummary | null> {
    const changed = this.ctx.storage.transactionSync(() => {
      if (this.store.run()?.status !== "quoted") return false;
      this.store.updateRun({ status: "awaiting_payment", pay_requested_at: Date.now() });
      return true;
    });
    if (changed) await this.index("awaiting_payment");
    return this.summary();
  }

  /**
   * The payment is confirmed: resolves the model snapshot once, starts the run and schedules its
   * first tick. A second call, or a call on a run that is not waiting for payment, changes nothing.
   */
  async paid(): Promise<RunSummary | null> {
    if (this.store.run()?.status !== "awaiting_payment") return this.summary();
    const models = await resolveRunModels(this.env);
    checkSnapshot(models);
    const config = deps.runConfig(this.env);
    const started = this.ctx.storage.transactionSync(() => {
      const run = this.store.run();
      if (run?.status !== "awaiting_payment") return false;
      const now = Date.now();
      const created = createRun(
        { id: run.id, question: run.question, mode: "thorough", models, config },
        now,
      );
      this.store.append(
        [paymentConfirmedEvent({ amount: run.amount, currency: run.currency }), ...created.events],
        now,
      );
      this.store.updateRun({
        status: "running",
        paid_at: now,
        models: JSON.stringify(models),
        budget_usd: created.state.config.budgetUsd,
        deadline_at: created.state.deadlineAt,
        attempt: 1,
        state: JSON.stringify(created.state),
      });
      return true;
    });
    if (started) await this.started();
    return this.summary();
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
      });
      return { ok: true, summary: this.summarize(this.requireRun()) };
    });
    if (result.ok) await this.started();
    return result;
  }

  private async started(): Promise<void> {
    await this.schedule();
    await this.index("running");
    this.broadcast();
  }

  // -------------------------------------------------------------------------------------------
  // The driver: one stage per alarm.

  override async alarm(info?: AlarmInvocationInfo): Promise<void> {
    const run = this.store.run();
    if (run?.status !== "running" || !run.state) return;
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
    const entries = await runCalls(state, step, {
      provider: deps.provider(this.env),
      ledger: this.store.ledger(prefix),
      now: Date.now,
    });
    const now = Date.now();
    const reduced = reduce(
      state,
      step,
      entries.map((entry) => entry.result),
      now,
    );
    if (!this.commit(run, state, reduced, now)) return;
    if (reduced.state.status === "running") await this.schedule();
    else await this.index(reduced.state.status);
  }

  private async fail(run: RunRecord, state: RunState): Promise<void> {
    const now = Date.now();
    if (this.commit(run, state, failRun(state, "error", now), now)) await this.index("failed");
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

  async snapshot(version: number): Promise<Snapshot | null> {
    if (!this.store.run()) return null;
    return this.store.snapshot(version);
  }

  /** Deletes the run: its row in the list, then everything the object stores. False when there is none. */
  async remove(): Promise<boolean> {
    const run = this.store.run();
    if (!run) return false;
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
        : (run.state?.stage ?? null);
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
