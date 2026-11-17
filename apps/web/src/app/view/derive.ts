import {
  type Answer,
  type DissentNote,
  MODELS,
  MODELS_BY_NAME,
  type ModelId,
  type RunView,
  type Source,
  selectAnswer,
  type Thread,
} from "@chebot/protocol";
import { t } from "../i18n/index.ts";
import { chartCounts, chartOpenPoints } from "./chart.ts";
import { type Discussion, discussionOf } from "./discussion.ts";

export type { Discussion, Position } from "./discussion.ts";

// What the run page shows, computed from the replayed view (the shared reducer's output) and
// `selectAnswer`. No text here except through `t`.

export type SeatStatus = "waiting" | "thinking" | "done" | "abstained";

export function seatStatus(view: RunView, model: ModelId): SeatStatus {
  return view.modelStatus[model] ?? "waiting";
}

/** The chip of a seat: its status, and for a model that missed a step after its draft, which. */
export function seatChip(view: RunView, model: ModelId): string {
  const status = seatStatus(view, model);
  if (status !== "abstained") return t.status[status];
  const last = view.abstentions.findLast((a) => a.seat === model);
  if (!last || last.stage === "drafting" || !view.drafts.some((d) => d.model === model))
    return t.status.abstained;
  return last.stage === "round1" ? t.abstainedLater.round1 : t.abstainedLater.votes;
}

/** Points in discussion: open discussions, or before any, the contested paragraphs. */
export function openPoints(view: RunView): number {
  const open = Object.values(view.threads).filter((th) => th.state === "open").length;
  if (open > 0) return open;
  const last = view.snapshots.at(-1);
  if (!last) return 0;
  return Object.values(last.blocks).filter(
    (b) => b.kind === "paragraph" && b.status === "contested",
  ).length;
}

/** The one line under the four seats. `waitingPayment`: the summary says so before the QR event. */
export function stageLine(view: RunView, waitingPayment = false): string {
  if (view.status === "expired") return t.stage.expired;
  if (view.status === "failed") return t.stage.failed;
  if (view.chart) return chartStageLine(view);
  if (view.status === "completed") {
    const answer = selectAnswer(view);
    const paragraphs = answer?.paragraphs ?? [];
    const agreed = paragraphs.filter((p) => p.status === "agreed").length;
    const dissent = new Set(answer?.dissent.map((d) => d.thread)).size;
    return t.stage.done(agreed, paragraphs.length, dissent);
  }
  if (view.status === "quoted") return waitingPayment ? t.stage.awaiting_payment : t.stage.quoted;
  if (view.status === "awaiting_payment") return t.stage.awaiting_payment;
  switch (view.stage) {
    case "drafting":
      return t.stage.drafting;
    case "merging":
      return t.stage.merging;
    case "round1":
      return t.stage.round1(openPoints(view));
    case "round2":
      return t.stage.round2(openPoints(view));
    case "round3":
      return t.stage.round3(openPoints(view));
    case "editing":
    case "done":
      return t.stage.editing;
    default:
      return t.stage.starting;
  }
}

/** The stage line of a chart run, once it started. */
function chartStageLine(view: RunView): string {
  const c = t.stage.chart;
  if (view.status === "completed") {
    const counts = chartCounts(view);
    return counts.origin === "user" ? c.doneUser(counts.dissent) : c.done(counts);
  }
  switch (view.stage) {
    case "drafting":
      return c.drafting[view.chart?.origin ?? "web"];
    case "merging":
      return c.merging;
    case "round1":
      return c.round1(chartOpenPoints(view));
    case "round2":
      return c.round2(chartOpenPoints(view));
    case "round3":
      return t.stage.round3(chartOpenPoints(view));
    default:
      return t.stage.starting;
  }
}

export interface ParagraphView {
  id: string;
  text: string;
  status: "agreed" | "majority" | "contested";
  support: ModelId[];
  tally: { for: number; of: number };
  /** Numbers of the sources the paragraph cites, in the list of sources (1-based). */
  sources: number[];
  /** The discussions about this paragraph: changes to it, and insertions proposed after it. */
  discussions: Discussion[];
  /** The accepted insertion that added this paragraph. */
  addedBy: Discussion | null;
  /** Suggestions on it that ended without agreement (or are still open), with who kept the text. */
  dissent: (DissentNote & { keep: ModelId[] })[];
  /** What the paragraph said when the answers were merged, if the discussion changed it. */
  before: string | null;
  /** Whether it carries a margin mark: not unanimous, or discussed. */
  marked: boolean;
}

export interface DocumentView {
  answer: Answer;
  paragraphs: ParagraphView[];
  sources: Source[];
}

/** The id of the paragraph an accepted insertion added: the one that first carried its text. */
function insertedParagraph(view: RunView, thread: Thread): string | null {
  const winner = thread.winner ? view.suggestions[thread.winner] : undefined;
  if (thread.state !== "accepted" || winner?.op !== "insert_after") return null;
  for (const snapshot of view.snapshots) {
    for (const id of snapshot.order) {
      const block = snapshot.blocks[id];
      if (block?.kind === "paragraph" && block.text === winner.text) return id;
    }
  }
  return null;
}

export function documentOf(view: RunView): DocumentView | null {
  const answer = selectAnswer(view);
  if (!answer) return null;
  const threads = Object.values(view.threads);
  const added = new Map<string, Thread>();
  for (const thread of threads) {
    const id = insertedParagraph(view, thread);
    if (id) added.set(id, thread);
  }
  const sourceNumber = new Map(answer.sources.map((s, i) => [s.id, i + 1]));
  const paragraphs = answer.paragraphs.map((p): ParagraphView => {
    const addedBy = added.get(p.id);
    const discussions = threads
      .filter(
        (th) => th.block === p.id && !(th.state === "accepted" && insertedParagraph(view, th)),
      )
      .map((th) => discussionOf(view, th));
    const dissent = answer.dissent
      .filter((d) => d.block === p.id)
      .map((d) => {
        const held = view.positions[d.thread] ?? {};
        return { ...d, keep: MODELS.filter((m) => held[m] === "keep") };
      });
    const seeded = view.snapshots[0]?.blocks[p.id];
    const before =
      seeded?.kind === "paragraph" &&
      seeded.text !== p.text &&
      discussions.some((d) => d.thread.state === "accepted")
        ? seeded.text
        : null;
    return {
      id: p.id,
      text: p.text,
      status: p.status,
      support: p.support,
      tally: p.tally,
      sources: p.sources.flatMap((id) => {
        const n = sourceNumber.get(id);
        return n ? [n] : [];
      }),
      discussions,
      addedBy: addedBy ? discussionOf(view, addedBy) : null,
      dissent,
      before,
      marked: p.status !== "agreed" || discussions.length > 0 || addedBy !== undefined,
    };
  });
  return { answer, paragraphs, sources: answer.sources };
}

/** The panel of the run ("who sat where"): the four seats and the assistant, as the run resolved them. */
export function seatsOf(
  view: RunView,
): { seat: ModelId | "utility"; id: string; effort: string | null }[] {
  if (!view.models) return [];
  const out: { seat: ModelId | "utility"; id: string; effort: string | null }[] = [];
  for (const seat of [...MODELS_BY_NAME, "utility" as const]) {
    const model = view.models[seat === "utility" ? "utility" : `panel.${seat}`];
    if (model) out.push({ seat, id: model.id, effort: model.effort });
  }
  return out;
}

/** Where a model was left out, in the words of the notes. */
type MissedStep = keyof typeof t.flags.abstained;

function missedStep(stage: string): MissedStep {
  if (stage === "drafting") return "drafting";
  return stage === "round1" ? "round1" : "votes";
}

/**
 * The notes about how the run went, in plain words: fewer answers than four, a budget or time
 * limit and what it left out (the discussion, or only the last pass), the models that missed a
 * step.
 */
export function flagNotes(view: RunView, answer: Pick<Answer, "flags" | "abstained">): string[] {
  const notes: string[] = [];
  const f = answer.flags;
  // Without a discussion there is no proposal and no version after the merge.
  const left =
    Object.keys(view.threads).length === 0 && view.snapshots.length <= 1 ? "discussion" : "final";
  if (f.fewDrafts) notes.push(t.flags.fewDrafts(view.drafts.length));
  if (f.budgetReached) notes.push(t.flags.budgetReached[left]);
  if (f.deadlineReached) notes.push(t.flags.deadlineReached[left]);
  if (f.quorumLost) notes.push(t.flags.quorumLost);
  if (f.mergeFallback) notes.push(t.flags.mergeFallback);
  const missed = new Map<MissedStep, Set<ModelId>>();
  for (const a of answer.abstained) {
    const step = missedStep(a.stage);
    // Fewer answers already says who did not write a draft.
    if (step === "drafting" && f.fewDrafts) continue;
    missed.set(step, (missed.get(step) ?? new Set()).add(a.model));
  }
  for (const step of ["drafting", "round1", "votes"] as const) {
    const who = MODELS.filter((m) => missed.get(step)?.has(m));
    if (who.length > 0) notes.push(t.flags.abstained[step](t.modelNames(who), who.length));
  }
  return notes;
}

/** The moments grouped by batch, oldest first. */
export function momentsByBatch(view: RunView): { batch: number; texts: string[] }[] {
  const groups: { batch: number; texts: string[] }[] = [];
  for (const m of view.moments) {
    const last = groups.at(-1);
    if (last?.batch === m.batch) last.texts.push(m.text);
    else groups.push({ batch: m.batch, texts: [m.text] });
  }
  return groups;
}
