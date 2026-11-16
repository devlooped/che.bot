import { join } from "node:path";
import {
  type CallsStep,
  chooseEditor,
  clone,
  DEFAULT_CONFIG,
  type ModelId,
  type ModelSnapshot,
  type RunState,
} from "@chebot/protocol";
import type { ModelProvider } from "@chebot/providers";
import { drive, type LedgerEntry, startRun } from "../driver.ts";
import { type Budget, guard, RAW_FILES } from "./budget.ts";
import type { Question } from "./questions.ts";

// One full run per question gives every arm. The run is driven on a virtual clock that advances
// by the longest call of each step, so a rerun that reads the ledger takes the same decisions
// (deadline checks, call timeouts) as the run that made the calls, and its wall-clock is the sum of
// the recorded latencies.

/** The start of every virtual clock. The time of day plays no part in a run. */
export const CLOCK_START = Date.UTC(2026, 0, 1);

export interface StepTime {
  stage: string;
  phase: string;
  /** The longest call of the step: the step's wall-clock. */
  latencyMs: number;
}

export interface Driven {
  /** False when the cap (or `--report`) stopped the drive before the run ended. */
  complete: boolean;
  state: RunState | null;
  steps: StepTime[];
  /** The sum of the steps. */
  wallMs: number;
}

export interface QuestionRun extends Driven {
  /** The run finished the other way: the same state before the editor, with the other policy. */
  variant: EditorVariant | null;
}

export interface EditorVariant {
  policy: "rotation";
  /** The editor of the run (closest) and of the variant (rotation). */
  editors: { closest: ModelId; rotation: ModelId };
  /** The same editor both ways: the variant is the run itself and makes no call. */
  sameEditor: boolean;
  complete: boolean;
  state: RunState | null;
}

export interface RunContext {
  provider: ModelProvider;
  budget: Budget;
  /** The directory of the question under the raw directory. */
  dir: string;
  models: ModelSnapshot;
  /** Overrides the budget of one question (the protocol's config by default). */
  runUsd: number | null;
  /** A line per call that lands, for the progress output. */
  onCall?: (key: string, entry: LedgerEntry & { cached: boolean }) => void;
  onSpend?: (key: string, costUsd: number) => void;
}

/** The worst case of a call of a run, by its key, from the protocol's config. */
export function runCallWorstUsd(key: string): number {
  const w = DEFAULT_CONFIG.worstCaseUsd;
  const [kind, n] = key.split(":");
  switch (kind) {
    case "draft":
      return w.draft;
    case "merge":
      return w.merge;
    case "round":
      return n === "3" ? w.round3 : w.round2;
    case "dedupe":
      return w.dedupe;
    case "edit":
      return w.editor;
    case "edit-check":
      return w.editor_check;
    default:
      return w.moments;
  }
}

export function runId(key: string): string {
  return `eval-${key}`;
}

/**
 * Drives the full run of a question from its start with its ledger (calls already made are read,
 * the rest are made), then finishes the same run with the rotating editor when that editor differs.
 */
export async function runQuestion(q: Question, key: string, ctx: RunContext): Promise<QuestionRun> {
  const before: { value: { state: RunState; at: number; editor: ModelId } | null } = {
    value: null,
  };
  const main = await driveOn(
    ctx,
    join(ctx.dir, RAW_FILES.run),
    startRun(
      {
        id: runId(key),
        question: q.question,
        mode: "thorough",
        models: ctx.models,
        ...(ctx.runUsd !== null ? { config: { budgetUsd: ctx.runUsd } } : {}),
      },
      CLOCK_START,
    ),
    CLOCK_START,
    (state, step, at) => {
      const editor = step.calls[0]?.seat;
      if (step.phase === "edit" && editor && editor !== "utility" && !before.value)
        before.value = { state: clone(state), at, editor };
    },
  );
  const start = before.value;
  if (!main.complete || !start) return { ...main, variant: null };
  const rotation = chooseEditor(start.state, "rotation");
  const editors = { closest: start.editor, rotation };
  if (rotation === start.editor) {
    return {
      ...main,
      variant: { policy: "rotation", editors, sameEditor: true, complete: true, state: main.state },
    };
  }
  const state = clone(start.state);
  state.config.editorPolicy = "rotation";
  // The moments do not change the answer: the variant writes them from templates, without a call.
  state.config.moments = "templates";
  const variant = await driveOn(ctx, join(ctx.dir, RAW_FILES.editor), { state, log: [] }, start.at);
  return {
    ...main,
    variant: {
      policy: "rotation",
      editors,
      sameEditor: false,
      complete: variant.complete,
      state: variant.state,
    },
  };
}

async function driveOn(
  ctx: RunContext,
  file: string,
  run: Parameters<typeof drive>[0],
  start: number,
  onStep?: (state: RunState, step: CallsStep, at: number) => void,
): Promise<Driven> {
  const guarded = guard({
    provider: ctx.provider,
    budget: ctx.budget,
    kind: "runs",
    file,
    worstUsd: runCallWorstUsd,
    ...(ctx.onSpend ? { onSpend: ctx.onSpend } : {}),
  });
  let t = start;
  const steps: StepTime[] = [];
  const driven = await drive(run, {
    provider: guarded.provider,
    ledger: guarded.ledger,
    now: () => t,
    signal: guarded.signal,
    onCall: (call, phase, entry) => {
      if (phase === "end" && entry) ctx.onCall?.(call.key, entry);
    },
    onStep: (state, step, entries) => {
      onStep?.(state, step, t);
      const latencyMs = Math.max(0, ...entries.map((e) => e.result.latencyMs));
      steps.push({ stage: step.stage, phase: step.phase, latencyMs });
      t += latencyMs;
    },
  });
  if (guarded.refused() || !driven.done) return { complete: false, state: null, steps, wallMs: 0 };
  return { complete: true, state: driven.state, steps, wallMs: t - start };
}
