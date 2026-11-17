import { MODELS, type ModelId, type RunView, type Snapshot } from "@chebot/protocol";
import { t } from "../i18n/index.ts";

// The history of the text (step 32): every stored version of the document, with what each step
// changed, computed from the replayed view (`snapshots` and `versions`). No text here except
// through `t`.

/** A piece of a paragraph: as it was, entered in this step, or left in this step. */
export interface Piece {
  kind: "same" | "added" | "removed";
  text: string;
}

export interface HistoryParagraph {
  id: string;
  /** New in this step, gone in this step, changed, or as it was. */
  change: "added" | "removed" | "changed" | "same";
  pieces: Piece[];
  /** The model whose accepted proposal made the change, when one did. */
  by: ModelId | null;
}

export interface HistoryStep {
  version: number;
  label: string;
  /** What this step did, in one sentence. */
  what: string;
  paragraphs: HistoryParagraph[];
}

/**
 * Words with the spaces after them, so that joining the tokens gives the text back and a change
 * of several words reads as one piece (spaces alone would match everywhere).
 */
function tokens(text: string): string[] {
  return text.split(/(?<=\s)(?=\S)/).filter((token) => token !== "");
}

/**
 * The pieces that turn `before` into `after`, word by word: the longest common sequence of tokens
 * is kept, the rest is removed or added. Paragraphs are short, so the quadratic table is fine.
 */
export function compareWords(before: string, after: string): Piece[] {
  const a = tokens(before);
  const b = tokens(after);
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      const row = lcs[i] as number[];
      row[j] =
        a[i] === b[j]
          ? (lcs[i + 1]?.[j + 1] ?? 0) + 1
          : Math.max(lcs[i + 1]?.[j] ?? 0, row[j + 1] ?? 0);
    }
  }
  const pieces: Piece[] = [];
  const push = (kind: Piece["kind"], text: string) => {
    const last = pieces.at(-1);
    if (last?.kind === kind) last.text += text;
    else pieces.push({ kind, text });
  };
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      push("same", a[i] as string);
      i++;
      j++;
    } else if (
      i < a.length &&
      (j >= b.length || (lcs[i + 1]?.[j] ?? 0) >= (lcs[i]?.[j + 1] ?? 0))
    ) {
      // What left goes before what entered in its place: "550" struck through, then "600".
      push("removed", a[i] as string);
      i++;
    } else {
      push("added", b[j] as string);
      j++;
    }
  }
  // A paragraph rewritten more than half reads better whole: the old one struck through, then
  // the new one, rather than a few shared words scattered between changes.
  const shared = pieces.filter((p) => p.kind === "same").reduce((n, p) => n + p.text.length, 0);
  if (shared < Math.max(before.length, after.length) / 2)
    return [
      { kind: "removed", text: before.endsWith(" ") ? before : `${before} ` },
      { kind: "added", text: after },
    ];
  return pieces;
}

function paragraphText(snapshot: Snapshot | undefined, id: string): string | null {
  const block = snapshot?.blocks[id];
  return block?.kind === "paragraph" ? block.text : null;
}

/** Who made each paragraph change of a step: the authors of the proposals it accepted. */
function authorsOf(view: RunView, threads: readonly string[], snapshot: Snapshot) {
  const byBlock = new Map<string, ModelId>();
  const authors: ModelId[] = [];
  for (const id of threads) {
    const thread = view.threads[id];
    const winner = thread?.winner ? view.suggestions[thread.winner] : undefined;
    if (!thread || !winner) continue;
    authors.push(winner.author);
    if (winner.op === "insert_after") {
      const added = snapshot.order.find((p) => paragraphText(snapshot, p) === winner.text);
      if (added) byBlock.set(added, winner.author);
    } else byBlock.set(thread.block, winner.author);
  }
  return { byBlock, authors: MODELS.filter((m) => authors.includes(m)) };
}

function labelOf(cause: RunView["versions"][number]): string {
  if (cause.cause === "merge") return t.history.steps.merge;
  if (cause.cause === "edit") return t.history.steps.edit;
  return t.history.steps.round(cause.round);
}

/**
 * The steps of the text, oldest first: the merged answer, then each version after it with its
 * paragraphs compared to the version before (what entered, what left, who proposed it).
 */
export function historyOf(view: RunView): HistoryStep[] {
  return view.snapshots.map((snapshot, index) => {
    const cause = view.versions[index] ?? {
      version: snapshot.version,
      cause: index === 0 ? "merge" : "round",
      threads: [],
      round: null,
    };
    const before = index > 0 ? view.snapshots[index - 1] : undefined;
    const { byBlock, authors } = authorsOf(view, cause.threads, snapshot);
    const paragraphs: HistoryParagraph[] = [];
    for (const id of snapshot.order) {
      const text = paragraphText(snapshot, id);
      if (text === null) continue;
      const old = before ? paragraphText(before, id) : text;
      const by = byBlock.get(id) ?? null;
      if (old === null)
        paragraphs.push({ id, change: "added", pieces: [{ kind: "added", text }], by });
      else if (old === text)
        paragraphs.push({ id, change: "same", pieces: [{ kind: "same", text }], by: null });
      else paragraphs.push({ id, change: "changed", pieces: compareWords(old, text), by });
    }
    // A paragraph that left in this step stays visible, struck through, where it was.
    for (const [position, id] of (before?.order ?? []).entries()) {
      const text = paragraphText(before, id);
      if (text === null || paragraphText(snapshot, id) !== null) continue;
      const previous = before?.order[position - 1];
      const at = paragraphs.findIndex((p) => p.id === previous);
      paragraphs.splice(at + 1, 0, {
        id,
        change: "removed",
        pieces: [{ kind: "removed", text }],
        by: byBlock.get(id) ?? null,
      });
    }
    const what =
      cause.cause === "merge"
        ? t.history.what.merge(view.drafts.length || 4)
        : cause.cause === "edit"
          ? t.history.what.edit
          : t.history.what.round(t.modelNames(authors), cause.threads.length);
    return { version: snapshot.version, label: labelOf(cause), what, paragraphs };
  });
}
