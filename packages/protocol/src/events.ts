import type { ChartBrief, ChartRender, Dispute, DroppedPatch, Verdict } from "./chart-run.ts";
import type { Dataset } from "./csv.ts";
import type {
  AbstainReason,
  ChartOrigin,
  Claim,
  Flags,
  Mode,
  ModelId,
  ModelSnapshot,
  RunStage,
  Snapshot,
  Source,
  Stage,
  Suggestion,
  Tally,
} from "./model.ts";

export type QuestionClass = "simple" | "complex";
/** Why a run failed: no draft at all, the budget or deadline before any draft, or a driver error. */
export type FailureReason = "no_drafts" | "budget" | "deadline" | "error";
export type Cut = "budget" | "deadline";

/**
 * The events of a run: the only thing the UI reads. Each carries a deterministic idempotency key
 * (unique in the run) and the number of the batch it belongs to; whoever appends them assigns
 * `seq` and `at` (see `appendEvents`). Threads, suggestions, votes and every document version are a
 * reduction of this log (see `replay`).
 */
export type RunEvent = { key: string; batch: number } & (
  | {
      type: "run.quoted";
      class: QuestionClass;
      probability: number;
      amount: number;
      currency: string;
    }
  | { type: "payment.requested"; amount: number; currency: string; qr: string }
  | { type: "payment.confirmed"; amount: number; currency: string }
  | { type: "run.expired" }
  | {
      type: "run.started";
      runId: string;
      question: string;
      mode: Mode;
      models: ModelSnapshot;
      budgetUsd: number;
      deadlineAt: number;
      /** A chart run: where its data comes from, and the upload (parsed by code) for user data. */
      chart: { origin: ChartOrigin; dataset: Dataset | null } | null;
    }
  | { type: "stage.changed"; stage: Stage; from: Stage | null; cut: Cut | null }
  | {
      type: "model.status";
      model: ModelId;
      status: "thinking" | "done" | "abstained";
      call: string;
      stage: RunStage;
      reason: AbstainReason | null;
    }
  | {
      type: "draft.completed";
      model: ModelId;
      answer: string;
      claims: Claim[];
      /** The sources this model found first. */
      sources: Source[];
      /** The ids of earlier sources this model found too (absent when none). */
      alsoFound?: string[];
    }
  | {
      type: "document.seeded";
      snapshot: Snapshot;
      conflicts: { first: string; second: string }[];
      flags: Flags;
    }
  | { type: "suggestion.opened"; suggestion: Suggestion; lockKey: string; newThread: boolean }
  | {
      type: "suggestion.merged";
      suggestion: string;
      thread: string;
      model: ModelId;
      reason: string;
    }
  | {
      type: "vote.cast";
      thread: string;
      model: ModelId;
      round: 2 | 3;
      choice: string;
      changed: boolean;
      reason: string;
    }
  | { type: "thread.accepted"; thread: string; winner: string; tally: Tally }
  | { type: "thread.rejected"; thread: string; tally: Tally }
  | {
      type: "thread.unresolved";
      thread: string;
      why: "two_qualify" | "no_majority";
      tally: Tally;
    }
  | {
      type: "snapshot.created";
      snapshot: Snapshot;
      /** "render": the chart of the last version that rendered, after one that did not. */
      cause: "round" | "edit" | "render";
      threads: string[];
    }
  // chart runs
  | {
      type: "brief.completed";
      model: ModelId;
      brief: ChartBrief;
      /** The sources this model found first. */
      sources: Source[];
      /** The ids of earlier sources this model found too (absent when none). */
      alsoFound?: string[];
    }
  | {
      type: "chart.written";
      block: string;
      writer: ModelId | null;
      /** The writer's spec, or the plain chart of code when it did not come, parse or render. */
      used: "writer" | "plain";
      why: string | null;
      /** What of the theme was taken out of the writer's spec. */
      stripped: string[];
    }
  | ({ type: "chart.rendered" } & ChartRender)
  | { type: "dispute.opened"; dispute: Dispute }
  | {
      type: "rows.checked";
      model: ModelId;
      round: 1 | 2 | 3;
      checks: { row: string; value: string; verdict: Verdict; reason: string }[];
    }
  | {
      type: "dispute.settled";
      dispute: string;
      row: string;
      state: Exclude<Dispute["state"], "open">;
      winner: string | null;
      holds: Record<string, { holds: number; checkers: number; stated: boolean }>;
    }
  | ({ type: "patch.dropped" } & DroppedPatch)
  | { type: "moment"; text: string; origin: "model" | "template" }
  | { type: "run.completed"; version: number; flags: Flags; spentUsd: number }
  | { type: "run.failed"; reason: FailureReason; spentUsd: number }
);

export type EventType = RunEvent["type"];
export type EventOf<T extends EventType> = Extract<RunEvent, { type: T }>;
export type LoggedEvent = RunEvent & { seq: number; at: number };

/**
 * Appends events to a log: assigns `seq` after the last one and `at`, and skips an event whose key
 * is already in the log (appending twice is a no-op). Returns the new log and what was appended.
 */
export function appendEvents(
  log: readonly LoggedEvent[],
  events: readonly RunEvent[],
  now: number,
): { log: LoggedEvent[]; appended: LoggedEvent[] } {
  const keys = new Set(log.map((e) => e.key));
  let seq = log.reduce((max, e) => Math.max(max, e.seq), 0);
  const appended: LoggedEvent[] = [];
  for (const event of events) {
    if (keys.has(event.key)) continue;
    keys.add(event.key);
    appended.push({ ...event, seq: ++seq, at: now });
  }
  return { log: [...log, ...appended], appended };
}

// Events of the stages the server drives before the protocol starts (batch 0).

export function quotedEvent(input: {
  class: QuestionClass;
  probability: number;
  amount: number;
  currency: string;
}): RunEvent {
  return { key: "run.quoted", batch: 0, type: "run.quoted", ...input };
}

export function paymentRequestedEvent(input: {
  amount: number;
  currency: string;
  qr: string;
}): RunEvent {
  return { key: "payment.requested", batch: 0, type: "payment.requested", ...input };
}

export function paymentConfirmedEvent(input: { amount: number; currency: string }): RunEvent {
  return { key: "payment.confirmed", batch: 0, type: "payment.confirmed", ...input };
}

export function expiredEvent(): RunEvent {
  return { key: "run.expired", batch: 0, type: "run.expired" };
}
