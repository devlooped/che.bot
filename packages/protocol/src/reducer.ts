import type { z } from "zod";
import { type CallKind, type ConfigOverrides, type RunConfig, resolveConfig } from "./config.ts";
import type { Cut, RunEvent } from "./events.ts";
import {
  type AbstainReason,
  type Abstention,
  type Claim,
  type Draft,
  type Flags,
  MODELS,
  type Mode,
  type ModelId,
  type ModelSnapshot,
  type RunStage,
  type Seat,
  type Snapshot,
  type Source,
  type Suggestion,
  type Thread,
  type Vote,
} from "./model.ts";
import { momentFacts, templateMoments } from "./moments.ts";
import { draftPrompt } from "./prompts/draft.ts";
import { type MergeDraft, mergePrompt } from "./prompts/merge.ts";
import { roundPrompt, type ThreadView } from "./prompts/round.ts";
import { dedupePrompt, editorCheckPrompt, editorPrompt, momentsPrompt } from "./prompts/utility.ts";
import { type OutputOf, schemaFor } from "./schemas.ts";
import { type Conflict, seedDocument } from "./seed.ts";
import {
  apply,
  type Candidate,
  castVotes,
  changesOf,
  checkSuggestions,
  type DroppedSuggestion,
  type DuplicatePair,
  duplicatePairs,
  pairsToAsk,
  placeCandidates,
  resolveThreads,
} from "./threads.ts";
import { normalizeUrl } from "./urls.ts";
import { clone, hash, normalizeText, seededShuffle } from "./util.ts";

// The orchestrator: pure functions over a JSON run state. `nextStep` says which calls to make,
// `reduce` folds their results into a new state and the events to append. The state holds no
// classes, Maps, functions or Dates: it is stored as text and reloaded between steps.

/** A model call, as data. The driver maps `seat` to a model of the run's snapshot. */
export interface Call {
  key: string; // idempotency key, unique in the run: "draft:0:grok", "merge:0", "round:1:claude"
  seat: Seat;
  kind: CallKind;
  system: string;
  prompt: string;
  schema: z.ZodType; // SCHEMAS[kind]; never stored in the state
  maxOutputTokens: number;
  search?: { maxResults: number };
  timeoutMs: number;
}

export interface FoundSource {
  url: string;
  title: string;
  quote: string;
}

export type CallResult =
  | {
      status: "ok";
      key: string;
      output: unknown; // parsed by the schema; parsed again here
      sources: FoundSource[]; // found by search in that call
      usage: { inputTokens: number; outputTokens: number };
      costUsd: number;
      latencyMs: number;
    }
  | {
      status: "abstained";
      key: string;
      reason: AbstainReason;
      costUsd: number;
      latencyMs: number;
    };

export type Phase =
  | "draft"
  | "merge"
  | "round"
  | "dedupe"
  | "moments"
  | "edit"
  | "edit_check"
  | "finish";

/**
 * What to do next. `calls` may be empty (a stage skipped by the budget, the end of the run): the
 * driver still passes the step to `reduce`. `cut` says that a budget or deadline check diverted the
 * run at this step.
 */
export type Step =
  | {
      kind: "calls";
      id: string;
      stage: RunStage;
      phase: Phase;
      batch: number;
      cut: Cut | null;
      calls: Call[];
    }
  | { kind: "done" };

export type CallsStep = Extract<Step, { kind: "calls" }>;

export type Next =
  | { phase: "draft" }
  | { phase: "merge" }
  | { phase: "round"; round: 1 | 2 | 3 }
  | { phase: "close" }
  | { phase: "edit_check" }
  | { phase: "finish" };

export interface CallRecord {
  key: string;
  seat: Seat;
  kind: CallKind;
  stage: RunStage;
  status: "ok" | "abstained";
  reason: AbstainReason | null;
  costUsd: number;
  latencyMs: number;
  usage: { inputTokens: number; outputTokens: number } | null;
}

export interface RoundSummary {
  round: 1 | 2 | 3;
  answered: ModelId[];
  newSuggestions: number;
  changedPositions: number;
}

export interface Rewrite {
  id: string;
  before: string;
  after: string;
}

export interface RunState {
  v: 1;
  id: string;
  question: string;
  mode: Mode;
  models: ModelSnapshot;
  config: RunConfig;
  startedAt: number;
  deadlineAt: number;
  updatedAt: number;
  status: "running" | "completed" | "failed";
  failure: null | "no_drafts" | "budget" | "deadline";
  stage: RunStage | null; // the stage of the last step; null before the first
  next: Next;
  batch: number;
  stepNo: number;
  spentUsd: number;
  calls: Record<string, CallRecord>;
  drafts: Draft[]; // in model order
  claims: Record<string, Claim>;
  sources: Source[];
  conflicts: Conflict[];
  snapshots: Snapshot[]; // every version; version 1 is the quick-mode answer
  // the suggestion engine (see threads.ts, `Book`)
  suggestions: Record<string, Suggestion>;
  threads: Record<string, Thread>;
  positions: Record<string, Partial<Record<ModelId, string>>>;
  votes: Vote[];
  rejected: string[];
  counters: { suggestion: number; thread: number; paragraph: number; source: number };
  dropped: DroppedSuggestion[];
  /** Round results waiting for the duplicate check of the utility model. */
  pending: {
    round: 1 | 2;
    candidates: Candidate[];
    pairs: DuplicatePair[];
    summary: RoundSummary;
  } | null;
  rounds: RoundSummary[];
  edit: { editor: ModelId; rewrites: Rewrite[]; kept: string[] } | null;
  /** Events since the last moments, which the next moments step phrases. */
  recent: RunEvent[];
  momentsDue: boolean;
  moments: { batch: number; text: string; origin: "model" | "template" }[];
  flags: Flags;
  abstentions: Abstention[];
}

export interface CreateRunInput {
  id: string;
  question: string;
  mode: Mode;
  models: ModelSnapshot;
  config?: ConfigOverrides;
}

/** A new run, at the drafting stage, and its `run.started` event. */
export function createRun(
  input: CreateRunInput,
  now: number,
): { state: RunState; events: RunEvent[] } {
  const config = resolveConfig(input.config);
  const deadlineAt = now + config.deadlineMs[input.mode];
  const started: RunEvent = {
    key: "run.started",
    batch: 0,
    type: "run.started",
    runId: input.id,
    question: input.question,
    mode: input.mode,
    models: input.models,
    budgetUsd: config.budgetUsd,
    deadlineAt,
  };
  const state: RunState = {
    v: 1,
    id: input.id,
    question: input.question,
    mode: input.mode,
    models: input.models,
    config,
    startedAt: now,
    deadlineAt,
    updatedAt: now,
    status: "running",
    failure: null,
    stage: null,
    next: { phase: "draft" },
    batch: 0,
    stepNo: 0,
    spentUsd: 0,
    calls: {},
    drafts: [],
    claims: {},
    sources: [],
    conflicts: [],
    snapshots: [],
    suggestions: {},
    threads: {},
    positions: {},
    votes: [],
    rejected: [],
    counters: { suggestion: 0, thread: 0, paragraph: 1, source: 0 },
    dropped: [],
    pending: null,
    rounds: [],
    edit: null,
    recent: [started],
    momentsDue: false,
    moments: [],
    flags: {
      fewDrafts: false,
      mergeFallback: null,
      budgetReached: false,
      deadlineReached: false,
      quorumLost: false,
    },
    abstentions: [],
  };
  return { state, events: [started] };
}

// ---------------------------------------------------------------------------------------------
// nextStep

/**
 * The calls to make next, or done. A function of the state, except that the deadline is checked
 * against `now` before a round and before an optional utility call: the step then carries the cut.
 */
export function nextStep(state: RunState, now: number): Step {
  if (state.status !== "running") return { kind: "done" };
  const s = stepAt(state, now);
  // No call outlives the deadline of the run: the merge, which no check skips, gets what is left.
  const left = Math.max(0, state.deadlineAt - now);
  for (const c of s.calls) c.timeoutMs = Math.min(c.timeoutMs, left);
  return s;
}

function stepAt(state: RunState, now: number): CallsStep {
  if (state.pending) return dedupeStep(state, now);
  if (state.momentsDue) return momentsStep(state, now);
  const next = state.next;
  switch (next.phase) {
    case "draft":
      return draftStep(state);
    case "merge":
      return step(
        state,
        "merging",
        "merge",
        fits(state, { merge: 1 }) ? [mergeCall(state)] : [],
        null,
      );
    case "round":
      return roundStep(state, next.round, now);
    case "close":
      return closeStep(state, null, now);
    case "edit_check":
      return editCheckStep(state, now);
    case "finish":
      return finishStep(state, null);
  }
}

function step(
  state: RunState,
  stage: RunStage,
  phase: Phase,
  calls: Call[],
  cut: Cut | null,
): CallsStep {
  return {
    kind: "calls",
    id: `${state.stepNo}:${phase}`,
    stage,
    phase,
    batch: stage === state.stage ? state.batch : state.batch + 1,
    cut,
    calls,
  };
}

function call(
  state: RunState,
  key: string,
  seat: Seat,
  kind: CallKind,
  prompt: { system: string; prompt: string },
  search?: { maxResults: number },
): Call {
  const t = state.config.callTimeoutMs;
  const timeoutMs =
    kind === "draft"
      ? t.draft
      : kind === "merge"
        ? t.merge
        : kind === "round1" || kind === "round2" || kind === "round3"
          ? t.round
          : kind === "editor"
            ? t.editor
            : t.utility;
  return {
    key,
    seat,
    kind,
    system: prompt.system,
    prompt: prompt.prompt,
    schema: schemaFor(kind),
    maxOutputTokens: state.config.maxOutputTokens[kind],
    ...(search ? { search } : {}),
    timeoutMs,
  };
}

/** Whether the spend so far plus the worst case of these calls (count per kind) fits the budget. */
function fits(state: RunState, calls: Partial<Record<CallKind, number>>): boolean {
  let worst = 0;
  for (const [kind, n] of Object.entries(calls) as [CallKind, number][]) {
    worst += state.config.worstCaseUsd[kind] * n;
  }
  return state.spentUsd + worst <= state.config.budgetUsd + 1e-9;
}

function inTime(state: RunState, now: number, timeoutMs: number): boolean {
  return now + timeoutMs <= state.deadlineAt;
}

function draftStep(state: RunState): CallsStep {
  if (!fits(state, { draft: MODELS.length })) return finishStep(state, "budget");
  const maxResults = state.config.searchResultsPerDraft;
  const prompt = draftPrompt({ question: state.question, maxResults });
  return step(
    state,
    "drafting",
    "draft",
    MODELS.map((m) => call(state, `draft:0:${m}`, m, "draft", prompt, { maxResults })),
    null,
  );
}

function mergeCall(state: RunState): Call {
  const drafts: MergeDraft[] = state.drafts.map((d) => ({
    label: draftLabel(state.id, d.model),
    answer: d.answer,
    claims: d.claims
      .map((id) => state.claims[id])
      .filter((c): c is Claim => c !== undefined)
      .map((c) => ({ id: c.id, text: c.text, confidence: c.confidence })),
  }));
  drafts.sort((a, b) => (a.label < b.label ? -1 : 1));
  return call(
    state,
    "merge:0",
    "utility",
    "merge",
    mergePrompt({ question: state.question, drafts }),
  );
}

/** Drafts are anonymized for the merge: a letter per model, shuffled per run. */
function draftLabel(runId: string, model: ModelId): string {
  return "ABCD"[seededShuffle(MODELS, `${runId}|drafts`).indexOf(model)] ?? "X";
}

const ROUND_KIND = { 1: "round1", 2: "round2", 3: "round3" } as const;

function roundStep(state: RunState, round: 1 | 2 | 3, now: number): CallsStep {
  const kind = ROUND_KIND[round];
  if (!inTime(state, now, state.config.callTimeoutMs.round))
    return closeStep(state, "deadline", now);
  if (!fits(state, { [kind]: MODELS.length })) return closeStep(state, "budget", now);
  const calls = MODELS.map((m) =>
    call(state, `round:${round}:${m}`, m, kind, roundPromptFor(state, m, round)),
  );
  return step(state, `round${round}`, "round", calls, null);
}

function latest(state: RunState): Snapshot {
  const s = state.snapshots.at(-1);
  if (!s) throw new Error("the run has no document yet");
  return s;
}

/** The threads a round votes on: open, and opened in an earlier round. */
function votableThreads(state: RunState, round: number): string[] {
  return Object.values(state.threads)
    .filter((t) => t.state === "open" && t.openedRound < round)
    .map((t) => t.id)
    .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
}

function roundPromptFor(state: RunState, voter: ModelId, round: 1 | 2 | 3) {
  const snapshot = latest(state);
  const threads: ThreadView[] = votableThreads(state, round).map((id) =>
    threadView(state, id, voter),
  );
  const locked = Object.values(state.threads)
    .filter((t) => t.state === "open" && t.lockKey === t.block)
    .map((t) => t.block);
  return roundPrompt({
    question: state.question,
    round,
    cap: round === 1 ? state.config.caps.round1 : state.config.caps.round2,
    snapshot,
    sources: state.sources,
    threads: round === 1 ? [] : threads,
    locked: round === 3 ? [] : locked,
  });
}

/**
 * A thread as `voter` sees it. The other three models are "Reviewer A/B/C", in an order shuffled
 * per thread and voter, seeded by the run id so that the reducer stays pure.
 */
export function reviewerLabels(
  runId: string,
  thread: string,
  voter: ModelId,
): Partial<Record<ModelId, string>> {
  const others = seededShuffle(
    MODELS.filter((m) => m !== voter),
    `${runId}|${thread}|${voter}`,
  );
  const labels: Partial<Record<ModelId, string>> = { [voter]: "you" };
  others.forEach((m, i) => {
    labels[m] = `Reviewer ${"ABC"[i]}`;
  });
  return labels;
}

function threadView(state: RunState, threadId: string, voter: ModelId): ThreadView {
  const thread = state.threads[threadId];
  if (!thread) throw new Error(`unknown thread ${threadId}`);
  const labels = reviewerLabels(state.id, threadId, voter);
  const positions = state.positions[threadId] ?? {};
  const shown = MODELS.filter((m) => m !== voter && positions[m] !== undefined).sort((a, b) =>
    (labels[a] ?? "") < (labels[b] ?? "") ? -1 : 1,
  );
  return {
    id: threadId,
    block: thread.block,
    alternatives: thread.alternatives.flatMap((id) => {
      const s = state.suggestions[id];
      if (!s) return [];
      return [
        {
          id,
          by: [s.author, ...s.coAuthors].map((m) => labels[m] ?? m).join(" and "),
          op: s.op,
          text: s.text,
          reason: s.reason,
        },
      ];
    }),
    positions: shown.map((m) => ({
      by: labels[m] ?? m,
      choice: positions[m] ?? "keep",
      reason: lastReason(state, threadId, m),
    })),
    yours: positions[voter] ?? null,
  };
}

function lastReason(state: RunState, threadId: string, model: ModelId): string {
  const vote = state.votes.findLast((v) => v.thread === threadId && v.voter === model && v.reason);
  if (vote) return vote.reason;
  const choice = state.positions[threadId]?.[model];
  const s = choice ? state.suggestions[choice] : undefined;
  return s && (s.author === model || s.coAuthors.includes(model)) ? s.reason : "";
}

function dedupeStep(state: RunState, now: number): CallsStep {
  const pending = state.pending;
  if (!pending) throw new Error("no pending round");
  const stage = state.stage ?? "round1";
  const ask = pairsToAsk(pending.pairs);
  const affordable =
    fits(state, { dedupe: 1 }) && inTime(state, now, state.config.callTimeoutMs.utility);
  if (ask.length === 0 || !affordable) return step(state, stage, "dedupe", [], null);
  const snapshot = latest(state);
  const describe = (other: DuplicatePair["other"]) => {
    if ("suggestion" in other) {
      const s = state.suggestions[other.suggestion];
      return { op: s?.op ?? "", text: s?.text ?? "" };
    }
    const c = pending.candidates[other.candidate];
    return { op: c?.op ?? "", text: c?.text ?? "" };
  };
  const pairs = ask.map((p) => {
    const c = pending.candidates[p.candidate];
    const block = c ? snapshot.blocks[c.block] : undefined;
    return {
      id: p.id,
      paragraph: block?.kind === "paragraph" ? block.text : "",
      first: describe(p.other),
      second: { op: c?.op ?? "", text: c?.text ?? "" },
    };
  });
  return step(
    state,
    stage,
    "dedupe",
    [call(state, `dedupe:${pending.round}`, "utility", "dedupe", dedupePrompt({ pairs }))],
    null,
  );
}

function momentsStep(state: RunState, now: number): CallsStep {
  const stage = state.stage ?? "drafting";
  const facts = momentFacts(state.recent, state.suggestions);
  const useModel =
    state.config.moments === "model" &&
    facts.length > 0 &&
    fits(state, { moments: 1 }) &&
    inTime(state, now, state.config.callTimeoutMs.utility);
  const calls = useModel
    ? [
        call(
          state,
          `moments:${state.batch}`,
          "utility",
          "moments",
          momentsPrompt({
            question: state.question,
            language: state.config.interfaceLanguage,
            facts,
          }),
        ),
      ]
    : [];
  return step(state, stage, "moments", calls, null);
}

/**
 * The end of the rounds: open threads are resolved for good and accepted changes applied; then
 * the editor pass if a suggestion was accepted in the run and the budget and the deadline leave
 * room for it, else done (the accepted changes are applied either way).
 */
function closeStep(state: RunState, cut: Cut | null, now: number): CallsStep {
  const preview = clone(state);
  resolveAndApply(preview, { final: true, round: 4 }, []);
  const accepted = Object.values(preview.threads).some((t) => t.state === "accepted");
  if (!accepted) return finishStep(state, cut);
  if (!fits(state, { editor: 1, editor_check: 1 })) return finishStep(state, cut ?? "budget");
  if (!inTime(state, now, state.config.callTimeoutMs.editor + state.config.callTimeoutMs.utility))
    return finishStep(state, cut ?? "deadline");
  const editor = chooseEditor(state, state.config.editorPolicy);
  const snapshot = latest(preview);
  const first = state.snapshots[0];
  const changed = snapshot.order.filter((id) => {
    const before = first?.blocks[id];
    const after = snapshot.blocks[id];
    return (
      !before ||
      (before.kind === "paragraph" && after?.kind === "paragraph" && before.text !== after.text)
    );
  });
  const prompt = editorPrompt({ question: state.question, snapshot, changed });
  return step(
    state,
    "editing",
    "edit",
    [call(state, `edit:0:${editor}`, editor, "editor", prompt)],
    cut,
  );
}

function editCheckStep(state: RunState, now: number): CallsStep {
  const rewrites = state.edit?.rewrites ?? [];
  const calls =
    rewrites.length > 0 &&
    fits(state, { editor_check: 1 }) &&
    inTime(state, now, state.config.callTimeoutMs.utility)
      ? [call(state, "edit-check:0", "utility", "editor_check", editorCheckPrompt({ rewrites }))]
      : [];
  return step(state, "editing", "edit_check", calls, null);
}

function finishStep(state: RunState, cut: Cut | null): CallsStep {
  return step(state, state.snapshots.length > 0 ? "done" : "failed", "finish", [], cut);
}

/**
 * The editor. "closest": the model whose draft claims are most in `agreed` and `majority`
 * paragraphs of the seeded document. "rotation": the next model in a rotation seeded by the run
 * id. Ties of "closest" go by that rotation. Only models with a draft are eligible.
 */
export function chooseEditor(state: RunState, policy: RunConfig["editorPolicy"]): ModelId {
  const start = hash(state.id) % MODELS.length;
  const rotation = [...MODELS.slice(start), ...MODELS.slice(0, start)];
  const drafted = new Set(state.drafts.map((d) => d.model));
  const eligible = rotation.filter((m) => drafted.has(m));
  const candidates = eligible.length > 0 ? eligible : rotation;
  if (policy === "rotation") return candidates[0] as ModelId;
  const score: Partial<Record<ModelId, number>> = {};
  const seeded = state.snapshots[0];
  for (const id of seeded?.order ?? []) {
    const block = seeded?.blocks[id];
    if (block?.kind !== "paragraph" || block.status === "contested") continue;
    for (const claimId of block.claims) {
      const claim = state.claims[claimId];
      if (claim) score[claim.model] = (score[claim.model] ?? 0) + 1;
    }
  }
  let best = candidates[0] as ModelId;
  for (const m of candidates) if ((score[m] ?? 0) > (score[best] ?? 0)) best = m;
  return best;
}

// ---------------------------------------------------------------------------------------------
// reduce

/**
 * The events a step starts with: the stage change and the "thinking" status of each panel model
 * called. A driver may append them before it runs the calls, so the UI sees the stage at once;
 * `reduce` returns them too, with the same keys, so the log is complete either way.
 */
export function beginStep(state: RunState, s: Step): RunEvent[] {
  if (s.kind !== "calls") return [];
  const events: RunEvent[] = [];
  if (s.stage !== state.stage) {
    events.push({
      key: `stage.changed:${s.stage}`,
      batch: s.batch,
      type: "stage.changed",
      stage: s.stage,
      from: state.stage,
      cut: s.cut,
    });
  }
  for (const c of s.calls) {
    if (c.seat === "utility") continue;
    events.push({
      key: `model.status:${c.key}:thinking`,
      batch: s.batch,
      type: "model.status",
      model: c.seat,
      status: "thinking",
      call: c.key,
      stage: s.stage,
      reason: null,
    });
  }
  return events;
}

/**
 * Folds the results of a step into a new state and the events to append. The input state is never
 * changed. Results are matched to calls by key, so their order does not matter; a call without a
 * result abstains ("error"); a second result for the same key is ignored. Throws on a stale step
 * (one not computed from this state).
 */
export function reduce(
  state: RunState,
  s: Step,
  results: readonly CallResult[],
  now: number,
): { state: RunState; events: RunEvent[] } {
  if (s.kind !== "calls" || state.status !== "running") return { state, events: [] };
  const expected = `${state.stepNo}:${s.phase}`;
  if (s.id !== expected) throw new Error(`stale step ${s.id}, expected ${expected}`);
  const run = clone(state);
  const events = beginStep(state, s);
  run.stage = s.stage;
  run.batch = s.batch;
  run.stepNo++;
  run.updatedAt = now;
  if (s.cut === "budget") run.flags.budgetReached = true;
  if (s.cut === "deadline") run.flags.deadlineReached = true;
  const outputs = recordResults(run, s, results, events);

  switch (s.phase) {
    case "draft":
      reduceDrafts(run, outputs, events);
      break;
    case "merge":
      reduceMerge(run, outputs, events);
      break;
    case "round":
      reduceRound(run, roundOf(s.stage), outputs, events);
      break;
    case "dedupe":
      reduceDedupe(run, outputs, events);
      break;
    case "moments":
      reduceMoments(run, outputs, events);
      break;
    case "edit":
      reduceEdit(run, s, outputs, events);
      break;
    case "edit_check":
      reduceEditCheck(run, outputs, events);
      break;
    case "finish":
      reduceFinish(run, s, events);
      break;
  }
  if (s.phase !== "moments") run.recent.push(...events);
  if (run.status !== "running") {
    run.recent = [];
    run.momentsDue = false;
  }
  return { state: run, events };
}

function roundOf(stage: RunStage): 1 | 2 | 3 {
  return stage === "round3" ? 3 : stage === "round2" ? 2 : 1;
}

interface Output {
  call: Call;
  output: unknown;
  sources: FoundSource[];
}

function recordResults(
  run: RunState,
  s: CallsStep,
  results: readonly CallResult[],
  events: RunEvent[],
): Map<string, Output> {
  const byKey = new Map<string, CallResult>();
  for (const r of results) if (!byKey.has(r.key)) byKey.set(r.key, r);
  const outputs = new Map<string, Output>();
  for (const c of s.calls) {
    const r: CallResult = byKey.get(c.key) ?? {
      status: "abstained",
      key: c.key,
      reason: "error",
      costUsd: 0,
      latencyMs: 0,
    };
    let reason: AbstainReason | null = r.status === "abstained" ? r.reason : null;
    if (r.status === "ok") {
      const parsed = schemaFor(c.kind).safeParse(r.output);
      if (parsed.success && valid(c.kind, parsed.data)) {
        outputs.set(c.key, { call: c, output: parsed.data, sources: r.sources });
      } else {
        reason = "invalid";
      }
    }
    const cost = Number.isFinite(r.costUsd) ? r.costUsd : 0;
    run.spentUsd += cost;
    run.calls[c.key] = {
      key: c.key,
      seat: c.seat,
      kind: c.kind,
      stage: s.stage,
      status: reason === null ? "ok" : "abstained",
      reason,
      costUsd: cost,
      latencyMs: r.latencyMs,
      usage: r.status === "ok" ? r.usage : null,
    };
    if (reason !== null)
      run.abstentions.push({ call: c.key, seat: c.seat, stage: s.stage, reason });
    if (c.seat !== "utility") {
      const status = reason === null ? "done" : "abstained";
      events.push({
        key: `model.status:${c.key}:${status}`,
        batch: s.batch,
        type: "model.status",
        model: c.seat,
        status,
        call: c.key,
        stage: s.stage,
        reason,
      });
    }
  }
  return outputs;
}

/** Checks a schema cannot express. A draft without an answer is an invalid output. */
function valid(kind: CallKind, output: unknown): boolean {
  if (kind === "draft") return (output as OutputOf<"draft">).answer.trim() !== "";
  return true;
}

function reduceDrafts(run: RunState, outputs: Map<string, Output>, events: RunEvent[]) {
  // Sources and the URLs of claims are matched by their normalized form (see normalizeUrl).
  const urls = new Map<string, string>();
  for (const s of run.sources) {
    const key = normalizeUrl(s.url);
    if (key && !urls.has(key)) urls.set(key, s.id);
  }
  for (const model of MODELS) {
    const out = outputs.get(`draft:0:${model}`);
    if (!out) continue;
    const draft = out.output as OutputOf<"draft">;
    const found = new Set<string>();
    const added: Source[] = [];
    for (const f of out.sources) {
      const url = f.url.trim();
      const key = normalizeUrl(url);
      if (!key) continue;
      found.add(key);
      if (urls.has(key)) continue;
      const source: Source = {
        id: `src${++run.counters.source}`,
        url,
        title: f.title,
        quote: f.quote,
        foundBy: model,
      };
      urls.set(key, source.id);
      run.sources.push(source);
      added.push(source);
    }
    const label = draftLabel(run.id, model);
    const claims: Claim[] = [];
    for (const c of draft.claims) {
      const text = c.text.trim();
      if (text === "") continue;
      // a URL counts only if the search of this call returned it
      const sources = [
        ...new Set(
          c.sources
            .map((u) => normalizeUrl(u))
            .filter((u): u is string => u !== undefined && found.has(u))
            .map((u) => urls.get(u) as string),
        ),
      ];
      claims.push({
        id: `${label}${claims.length + 1}`,
        model,
        text,
        confidence: c.confidence,
        sources,
      });
    }
    for (const c of claims) run.claims[c.id] = c;
    run.drafts.push({ model, answer: draft.answer.trim(), claims: claims.map((c) => c.id) });
    events.push({
      key: `draft.completed:${model}`,
      batch: run.batch,
      type: "draft.completed",
      model,
      answer: draft.answer.trim(),
      claims,
      sources: added,
    });
  }
  if (run.drafts.length === 0) return fail(run, "no_drafts", events);
  run.flags.fewDrafts = run.drafts.length < run.config.quorum;
  run.next = { phase: "merge" };
}

function reduceMerge(run: RunState, outputs: Map<string, Output>, events: RunEvent[]) {
  const out = outputs.get("merge:0");
  const seed = seedDocument({
    drafts: run.drafts,
    claims: run.claims,
    merge: out ? (out.output as OutputOf<"merge">) : null,
  });
  run.snapshots = [seed.snapshot];
  run.counters.paragraph = seed.nextParagraph;
  run.conflicts = seed.conflicts;
  run.flags.mergeFallback = seed.fallback;
  events.push({
    key: "document.seeded",
    batch: run.batch,
    type: "document.seeded",
    snapshot: seed.snapshot,
    conflicts: seed.conflicts,
    flags: { ...run.flags },
  });
  const contested = Object.values(seed.snapshot.blocks).some(
    (b) => b.kind === "paragraph" && b.status === "contested",
  );
  run.momentsDue = true;
  run.next =
    run.mode === "thorough" && !run.flags.fewDrafts && contested
      ? { phase: "round", round: 1 }
      : { phase: "finish" };
}

function reduceRound(
  run: RunState,
  round: 1 | 2 | 3,
  outputs: Map<string, Output>,
  events: RunEvent[],
) {
  const visible = new Set(votableThreads(run, round));
  const summary: RoundSummary = { round, answered: [], newSuggestions: 0, changedPositions: 0 };
  const candidates: Candidate[] = [];
  const snapshot = latest(run);
  const knownSources = new Set(run.sources.map((s) => s.id));
  for (const model of MODELS) {
    const out = outputs.get(`round:${round}:${model}`);
    if (!out) continue;
    summary.answered.push(model);
    const output = out.output as Partial<OutputOf<"round2">>;
    if (round > 1 && output.votes) {
      const cast = castVotes(run, {
        model,
        round: round as 2 | 3,
        votes: output.votes,
        visible,
        batch: run.batch,
      });
      events.push(...cast.events);
      summary.changedPositions += cast.changedPositions;
    }
    if (round < 3 && output.suggestions) {
      const checked = checkSuggestions({
        model,
        round: round as 1 | 2,
        suggestions: output.suggestions,
        cap: round === 1 ? run.config.caps.round1 : run.config.caps.round2,
        snapshot,
        knownSources,
      });
      candidates.push(...checked.candidates);
      run.dropped.push(...checked.dropped);
    }
  }
  if (round === 3) return completeRound(run, summary, events);
  const pairs = duplicatePairs(run, candidates);
  if (pairsToAsk(pairs).length > 0) {
    run.pending = { round: round as 1 | 2, candidates, pairs, summary };
    return;
  }
  place(run, round as 1 | 2, candidates, pairs, {}, summary, events);
}

function reduceDedupe(run: RunState, outputs: Map<string, Output>, events: RunEvent[]) {
  const pending = run.pending;
  if (!pending) return;
  run.pending = null;
  const out = outputs.get(`dedupe:${pending.round}`);
  const asked = new Set(pairsToAsk(pending.pairs).map((p) => p.id));
  const verdicts: Record<string, "same" | "different"> = {};
  for (const p of (out?.output as OutputOf<"dedupe"> | undefined)?.pairs ?? []) {
    const id = p.pair.trim();
    if (asked.has(id) && verdicts[id] === undefined) verdicts[id] = p.verdict;
  }
  place(run, pending.round, pending.candidates, pending.pairs, verdicts, pending.summary, events);
}

function place(
  run: RunState,
  round: 1 | 2,
  candidates: Candidate[],
  pairs: DuplicatePair[],
  verdicts: Record<string, "same" | "different">,
  summary: RoundSummary,
  events: RunEvent[],
) {
  const placed = placeCandidates(run, {
    candidates,
    pairs,
    verdicts,
    round,
    baseVersion: latest(run).version,
    batch: run.batch,
  });
  events.push(...placed.events);
  run.dropped.push(...placed.dropped);
  summary.newSuggestions += placed.newSuggestions;
  summary.changedPositions += placed.changedPositions;
  completeRound(run, summary, events);
}

/**
 * The round boundary. The rounds end after round 3; after a round answered by fewer models than
 * the quorum; after round 1 without any suggestion; and after round 2 (early stop) when it brought
 * no new suggestion and no changed position (a first vote is not a change), or when every thread
 * is settled. Threads are resolved (for good when the rounds end) and accepted changes applied in
 * one pass.
 */
function completeRound(run: RunState, summary: RoundSummary, events: RunEvent[]) {
  const round = summary.round;
  run.rounds.push(summary);
  const quorumLost = summary.answered.length < run.config.quorum;
  if (quorumLost) run.flags.quorumLost = true;
  const noThreads = Object.keys(run.threads).length === 0;
  const noProgress = round >= 2 && summary.newSuggestions === 0 && summary.changedPositions === 0;
  const last = round === 3 || quorumLost || noThreads || noProgress;
  resolveAndApply(run, { final: last, round }, events);
  const open = Object.values(run.threads).some((t) => t.state === "open");
  run.next = last || !open ? { phase: "close" } : { phase: "round", round: (round + 1) as 2 | 3 };
  run.momentsDue = true;
}

function resolveAndApply(
  run: RunState,
  input: { final: boolean; round: number },
  events: RunEvent[],
) {
  const resolved = resolveThreads(run, { ...input, batch: run.batch });
  events.push(...resolved.events);
  if (resolved.accepted.length === 0) return;
  const current = latest(run);
  const changes = changesOf(run, resolved.accepted, run.snapshots, current);
  const applied = apply(current, changes, run.counters.paragraph);
  run.snapshots.push(applied.snapshot);
  run.counters.paragraph = applied.nextParagraph;
  events.push({
    key: `snapshot.created:${applied.snapshot.version}`,
    batch: run.batch,
    type: "snapshot.created",
    snapshot: applied.snapshot,
    cause: "round",
    threads: resolved.accepted,
  });
}

function reduceEdit(run: RunState, s: CallsStep, outputs: Map<string, Output>, events: RunEvent[]) {
  resolveAndApply(run, { final: true, round: 4 }, events);
  const c = s.calls[0];
  if (!c || c.seat === "utility") throw new Error("an edit step calls one panel model");
  const current = latest(run);
  const rewrites: Rewrite[] = [];
  const out = outputs.get(c.key)?.output as OutputOf<"editor"> | undefined;
  for (const p of out?.paragraphs ?? []) {
    const id = p.id.trim();
    const block = current.blocks[id];
    const text = p.text.trim();
    if (block?.kind !== "paragraph" || text === "" || rewrites.some((r) => r.id === id)) continue;
    if (normalizeText(text) === normalizeText(block.text)) continue;
    rewrites.push({ id, before: block.text, after: text });
  }
  run.edit = { editor: c.seat, rewrites, kept: [] };
  if (rewrites.length > 0) run.next = { phase: "edit_check" };
  else thenFinish(run);
}

/** The stage is over: its moments, then the end of the run. */
function thenFinish(run: RunState) {
  run.momentsDue = true;
  run.next = { phase: "finish" };
}

/** A rewrite is kept only if the utility model says it makes the same claims; anything else drops it. */
function reduceEditCheck(run: RunState, outputs: Map<string, Output>, events: RunEvent[]) {
  const edit = run.edit;
  if (!edit) return thenFinish(run);
  const out = outputs.get("edit-check:0")?.output as OutputOf<"editor_check"> | undefined;
  const verdicts = new Map<string, string>();
  for (const c of out?.checks ?? []) {
    const id = c.id.trim();
    if (!verdicts.has(id)) verdicts.set(id, c.verdict);
  }
  const kept = edit.rewrites.filter((r) => verdicts.get(r.id) === "same");
  edit.kept = kept.map((r) => r.id);
  if (kept.length > 0) {
    const current = latest(run);
    const blocks = { ...current.blocks };
    for (const r of kept) {
      const block = blocks[r.id];
      if (block?.kind === "paragraph") blocks[r.id] = { ...block, text: r.after };
    }
    const snapshot: Snapshot = { version: current.version + 1, order: [...current.order], blocks };
    run.snapshots.push(snapshot);
    events.push({
      key: `snapshot.created:${snapshot.version}`,
      batch: run.batch,
      type: "snapshot.created",
      snapshot,
      cause: "edit",
      threads: [],
    });
  }
  thenFinish(run);
}

function reduceMoments(run: RunState, outputs: Map<string, Output>, events: RunEvent[]) {
  const out = outputs.get(`moments:${run.batch}`)?.output as OutputOf<"moments"> | undefined;
  const phrased = (out?.sentences ?? [])
    .map((t) => t.trim())
    .filter((t) => t !== "")
    .slice(0, 3);
  const origin = phrased.length > 0 ? "model" : "template";
  const texts = phrased.length > 0 ? phrased : templateMoments(run.recent);
  texts.forEach((text, i) => {
    run.moments.push({ batch: run.batch, text, origin });
    events.push({
      key: `moment:${run.batch}:${i}`,
      batch: run.batch,
      type: "moment",
      text,
      origin,
    });
  });
  run.recent = [];
  run.momentsDue = false;
}

function reduceFinish(run: RunState, s: CallsStep, events: RunEvent[]) {
  if (run.snapshots.length === 0) return fail(run, s.cut ?? "no_drafts", events);
  resolveAndApply(run, { final: true, round: 4 }, events);
  run.status = "completed";
  events.push({
    key: "run.completed",
    batch: run.batch,
    type: "run.completed",
    version: latest(run).version,
    flags: { ...run.flags },
    spentUsd: run.spentUsd,
  });
}

function fail(run: RunState, reason: NonNullable<RunState["failure"]>, events: RunEvent[]) {
  if (run.stage !== "failed") {
    events.push({
      key: "stage.changed:failed",
      batch: run.batch + 1,
      type: "stage.changed",
      stage: "failed",
      from: run.stage,
      cut: null,
    });
    run.batch++;
    run.stage = "failed";
  }
  run.status = "failed";
  run.failure = reason;
  events.push({
    key: "run.failed",
    batch: run.batch,
    type: "run.failed",
    reason,
    spentUsd: run.spentUsd,
  });
}
