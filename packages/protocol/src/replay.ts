import type { ChartBrief, ChartRender, Dispute, DroppedPatch } from "./chart-run.ts";
import type { EventOf, RunEvent } from "./events.ts";
import {
  type Abstention,
  type Claim,
  type Draft,
  type Flags,
  foundAgain,
  type Mode,
  type ModelId,
  type ModelSnapshot,
  type Snapshot,
  type Source,
  type Stage,
  type Suggestion,
  type Thread,
  type Vote,
} from "./model.ts";
import { clone } from "./util.ts";

/**
 * What the browser knows of a run: a reduction of its event log alone. Threads, suggestions,
 * votes, positions and every document version come out the same as in the run state.
 */
export interface RunView {
  runId: string | null;
  question: string | null;
  mode: Mode | null;
  models: ModelSnapshot | null;
  status: "new" | "quoted" | "awaiting_payment" | "running" | "completed" | "failed" | "expired";
  stage: Stage | null;
  quote: Omit<EventOf<"run.quoted">, "key" | "batch" | "type"> | null;
  payment: { amount: number; currency: string; qr: string } | null;
  paid: boolean;
  drafts: Draft[];
  claims: Record<string, Claim>;
  sources: Source[];
  conflicts: { first: string; second: string }[];
  snapshots: Snapshot[];
  /** Why each document version exists, in the order of `snapshots` (the history of the text). */
  versions: VersionCause[];
  suggestions: Record<string, Suggestion>;
  threads: Record<string, Thread>;
  positions: Record<string, Partial<Record<ModelId, string>>>;
  votes: Vote[];
  rejected: string[];
  moments: { batch: number; text: string; origin: "model" | "template" }[];
  modelStatus: Partial<Record<ModelId, "thinking" | "done" | "abstained">>;
  flags: Flags;
  abstentions: Abstention[];
  spentUsd: number | null;
  lastBatch: number;
  /** The charts the drafts proposed. */
  briefs: ChartBrief[];
  /** The proposed measures the answer does not chart, and why. */
  declined: Omit<EventOf<"chart.declined">, "key" | "batch" | "type">[];
  /** By chart: who wrote its spec, and whether the writer's spec or the plain one of code was used. */
  written: Record<string, Omit<EventOf<"chart.written">, "key" | "batch" | "type">>;
  disputes: Record<string, Dispute>;
  renders: ChartRender[];
  droppedPatches: DroppedPatch[];
}

/**
 * How a version of the document came to be: the merge of the drafts, the changes accepted after a
 * round of votes (`threads`, and `round`, the last round whose votes those threads had), or the
 * editor's pass.
 */
export interface VersionCause {
  version: number;
  cause: "merge" | "round" | "edit" | "render";
  threads: string[];
  round: number | null;
}

export function emptyView(): RunView {
  return {
    runId: null,
    question: null,
    mode: null,
    models: null,
    status: "new",
    stage: null,
    quote: null,
    payment: null,
    paid: false,
    drafts: [],
    claims: {},
    sources: [],
    conflicts: [],
    snapshots: [],
    versions: [],
    suggestions: {},
    threads: {},
    positions: {},
    votes: [],
    rejected: [],
    moments: [],
    modelStatus: {},
    flags: {
      fewDrafts: false,
      mergeFallback: null,
      budgetReached: false,
      deadlineReached: false,
      quorumLost: false,
    },
    abstentions: [],
    spentUsd: null,
    lastBatch: 0,
    briefs: [],
    declined: [],
    written: {},
    disputes: {},
    renders: [],
    droppedPatches: [],
  };
}

/**
 * Replays events, in log order, onto a view (a fresh one by default; `base` is not changed).
 * Events with a `seq` are sorted by it first.
 */
export function replay(events: readonly RunEvent[], base: RunView = emptyView()): RunView {
  const view = clone(base);
  const ordered = [...events].sort(
    (a, b) => ((a as { seq?: number }).seq ?? 0) - ((b as { seq?: number }).seq ?? 0),
  );
  for (const e of ordered) applyEvent(view, e);
  return view;
}

function setPosition(view: RunView, thread: string, model: ModelId, choice: string) {
  const positions = view.positions[thread] ?? {};
  positions[model] = choice;
  view.positions[thread] = positions;
}

function reject(view: RunView, ids: readonly string[]) {
  for (const id of ids) if (!view.rejected.includes(id)) view.rejected.push(id);
}

function applyEvent(view: RunView, e: RunEvent) {
  view.lastBatch = Math.max(view.lastBatch, e.batch);
  switch (e.type) {
    case "run.quoted":
      view.status = "quoted";
      view.stage = "quoted";
      view.quote = {
        class: e.class,
        probability: e.probability,
        amount: e.amount,
        currency: e.currency,
      };
      break;
    case "payment.requested":
      view.status = "awaiting_payment";
      view.stage = "awaiting_payment";
      view.payment = { amount: e.amount, currency: e.currency, qr: e.qr };
      break;
    case "payment.confirmed":
      view.paid = true;
      break;
    case "run.expired":
      view.status = "expired";
      view.stage = "expired";
      break;
    case "run.started": {
      // A second run.started is a new attempt of the same question (the free rerun of a failed
      // run): what the earlier attempt built is cleared; the quote and the payment stay.
      const { quote, payment, paid } = view;
      Object.assign(view, emptyView(), { quote, payment, paid, lastBatch: view.lastBatch });
      view.runId = e.runId;
      view.question = e.question;
      view.mode = e.mode;
      view.models = e.models;
      view.status = "running";
      break;
    }
    case "stage.changed":
      view.stage = e.stage;
      if (e.cut === "budget") view.flags.budgetReached = true;
      if (e.cut === "deadline") view.flags.deadlineReached = true;
      break;
    case "model.status":
      view.modelStatus[e.model] = e.status;
      if (e.status === "abstained" && e.reason) {
        view.abstentions.push({ call: e.call, seat: e.model, stage: e.stage, reason: e.reason });
      }
      break;
    case "draft.completed":
      view.drafts.push({ model: e.model, answer: e.answer, claims: e.claims.map((c) => c.id) });
      for (const c of e.claims) view.claims[c.id] = c;
      view.briefs.push(...clone(e.charts ?? []));
      view.sources.push(...e.sources);
      for (const id of e.alsoFound ?? []) foundAgain(view.sources, id, e.model);
      break;
    case "document.seeded":
      view.snapshots = [e.snapshot];
      view.versions = [{ version: e.snapshot.version, cause: "merge", threads: [], round: null }];
      view.conflicts = e.conflicts;
      view.flags = { ...e.flags };
      break;
    case "suggestion.opened": {
      const s = clone(e.suggestion);
      view.suggestions[s.id] = s;
      const thread = view.threads[s.thread];
      if (e.newThread || !thread) {
        view.threads[s.thread] = {
          id: s.thread,
          lockKey: e.lockKey,
          block: s.target.block,
          openedRound: s.round,
          alternatives: [s.id],
          state: "open",
        };
      } else {
        thread.alternatives.push(s.id);
      }
      setPosition(view, s.thread, s.author, s.id);
      break;
    }
    case "suggestion.merged":
      view.suggestions[e.suggestion]?.coAuthors.push(e.model);
      setPosition(view, e.thread, e.model, e.suggestion);
      break;
    case "vote.cast":
      view.votes.push({
        thread: e.thread,
        voter: e.model,
        round: e.round,
        choice: e.choice,
        reason: e.reason,
        changed: e.changed,
      });
      setPosition(view, e.thread, e.model, e.choice);
      break;
    case "thread.accepted": {
      const t = view.threads[e.thread];
      if (!t) break;
      t.state = "accepted";
      t.winner = e.winner;
      t.tally = e.tally;
      reject(
        view,
        t.alternatives.filter((id) => id !== e.winner),
      );
      break;
    }
    case "thread.rejected": {
      const t = view.threads[e.thread];
      if (!t) break;
      t.state = "rejected";
      t.tally = e.tally;
      reject(view, t.alternatives);
      break;
    }
    case "thread.unresolved": {
      const t = view.threads[e.thread];
      if (!t) break;
      t.state = "unresolved";
      t.why = e.why;
      t.tally = e.tally;
      break;
    }
    case "snapshot.created": {
      view.snapshots.push(e.snapshot);
      const rounds = view.votes.filter((v) => e.threads.includes(v.thread)).map((v) => v.round);
      view.versions.push({
        version: e.snapshot.version,
        cause: e.cause,
        threads: [...e.threads],
        round: rounds.length > 0 ? Math.max(...rounds) : null,
      });
      break;
    }
    case "moment":
      view.moments.push({ batch: e.batch, text: e.text, origin: e.origin });
      break;
    case "run.completed":
      view.status = "completed";
      view.flags = { ...e.flags };
      view.spentUsd = e.spentUsd;
      break;
    case "run.failed":
      view.status = "failed";
      view.spentUsd = e.spentUsd;
      break;
    case "chart.declined":
      view.declined.push({
        measure: e.measure,
        briefs: [...e.briefs],
        models: [...e.models],
        why: e.why,
      });
      break;
    case "chart.written":
      view.written[e.block] = {
        block: e.block,
        writer: e.writer,
        used: e.used,
        why: e.why,
        stripped: [...e.stripped],
      };
      break;
    case "chart.rendered":
      view.renders.push({
        version: e.version,
        block: e.block,
        call: e.call,
        result: e.result,
        ok: e.ok,
        error: e.error,
      });
      break;
    case "dispute.opened":
      view.disputes[e.dispute.id] = clone(e.dispute);
      break;
    case "rows.checked":
      for (const c of e.checks) {
        const d = Object.values(view.disputes).find(
          (x) => x.state === "open" && x.block === c.block && x.row === c.row,
        );
        if (!d) continue;
        const checks = d.checks[c.value] ?? {};
        checks[e.model] = c.verdict;
        d.checks[c.value] = checks;
      }
      break;
    case "dispute.settled": {
      const d = view.disputes[e.dispute];
      if (!d) break;
      d.state = e.state;
      d.winner = e.winner;
      break;
    }
    case "patch.dropped": {
      view.droppedPatches.push({
        round: e.round,
        model: e.model,
        index: e.index,
        block: e.block,
        layer: e.layer,
        path: e.path,
        why: e.why,
        detail: e.detail,
      });
      break;
    }
  }
}
