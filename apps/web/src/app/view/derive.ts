import {
  type Answer,
  type DissentNote,
  MODELS,
  type ModelId,
  type RunView,
  type Source,
  type Suggestion,
  selectAnswer,
  type Thread,
  type Vote,
} from "@chebot/protocol";
import { t } from "../i18n/index.ts";

// What the run page shows, computed from the replayed view (the shared reducer's output) and
// `selectAnswer`. No text here except through `t`.

export type SeatStatus = "waiting" | "thinking" | "done" | "abstained";

export function seatStatus(view: RunView, model: ModelId): SeatStatus {
  return view.modelStatus[model] ?? "waiting";
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

/** One model's place in a discussion: what it holds at the end, and the votes it gave. */
export interface Position {
  model: ModelId;
  /** A suggestion id, "keep", or null when it never took a position. */
  choice: string | null;
  votes: Vote[];
  /** The reason of its last change of position, if it changed. */
  changedBecause: string | null;
  /** The reason it gave for its position without changing it, if any. */
  saidWhy: string | null;
}

export interface Discussion {
  thread: Thread;
  alternatives: Suggestion[];
  positions: Position[];
}

export function discussionOf(view: RunView, thread: Thread): Discussion {
  const held = view.positions[thread.id] ?? {};
  return {
    thread,
    alternatives: thread.alternatives.flatMap((id) => {
      const s = view.suggestions[id];
      return s ? [s] : [];
    }),
    positions: MODELS.map((model) => {
      const votes = view.votes.filter((v) => v.thread === thread.id && v.voter === model);
      const changed = votes.findLast((v) => v.changed && v.reason);
      const said = votes.findLast((v) => !v.changed && v.reason);
      return {
        model,
        choice: held[model] ?? null,
        votes,
        changedBecause: changed?.reason ?? null,
        saidWhy: changed ? null : (said?.reason ?? null),
      };
    }),
  };
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
  for (const seat of [...MODELS, "utility" as const]) {
    const model = view.models[seat === "utility" ? "utility" : `panel.${seat}`];
    if (model) out.push({ seat, id: model.id, effort: model.effort });
  }
  return out;
}

/** The notes about how the run went, in plain words. */
export function flagNotes(answer: Answer): string[] {
  const notes: string[] = [];
  const f = answer.flags;
  if (f.fewDrafts) notes.push(t.flags.fewDrafts);
  if (f.budgetReached) notes.push(t.flags.budgetReached);
  if (f.deadlineReached) notes.push(t.flags.deadlineReached);
  if (f.quorumLost) notes.push(t.flags.quorumLost);
  if (f.mergeFallback) notes.push(t.flags.mergeFallback);
  const out = [...new Set(answer.abstained.map((a) => a.model))];
  if (out.length > 0) notes.push(t.flags.abstained(t.modelNames(out)));
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
