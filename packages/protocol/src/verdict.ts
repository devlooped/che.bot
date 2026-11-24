import {
  type Draft,
  type DraftVerdict,
  MODELS,
  type ModelId,
  type QuestionKind,
  type Rating,
} from "./model.ts";

/**
 * The verdict of a run, for its card: what the question asks, as most drafts say, and each model's
 * rating. `outcome` is the rating most models gave, "split" when two ratings or more tie, null
 * when no model rated it. A fact has no votes: its card says "Dato".
 */
export interface RunVerdict {
  kind: QuestionKind;
  outcome: Rating | "split" | null;
  /** By model, for the models whose draft has a verdict; null: it took the question for a fact. */
  votes: Partial<Record<ModelId, Rating | null>>;
}

/** A draft's verdict from its output: the rating "none", or any rating of a fact, is no rating. */
export function readVerdict(output: { kind: QuestionKind; rating: Rating | "none" }): DraftVerdict {
  const rating = output.kind === "fact" || output.rating === "none" ? null : output.rating;
  return { kind: output.kind, rating };
}

/** The value most items have; a tie goes to the one that came first. */
function mostCommon<T>(items: readonly T[]): { value: T; tied: boolean } | null {
  const counts = new Map<T, number>();
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);
  let best: { value: T; count: number; tied: boolean } | null = null;
  for (const [value, count] of counts) {
    if (!best || count > best.count) best = { value, count, tied: false };
    else if (count === best.count) best.tied = true;
  }
  return best && { value: best.value, tied: best.tied };
}

/**
 * The verdict of the drafts; null when none has one (a run before the verdicts). The kind is the
 * one most drafts gave, a tie broken by the fixed order of the models.
 */
export function verdictOf(drafts: readonly Pick<Draft, "model" | "verdict">[]): RunVerdict | null {
  const rated = MODELS.flatMap((model) => {
    const verdict = drafts.find((d) => d.model === model)?.verdict;
    return verdict ? [{ model, ...verdict }] : [];
  });
  const kind = mostCommon(rated.map((r) => r.kind))?.value;
  if (!kind) return null;
  if (kind === "fact") return { kind, outcome: null, votes: {} };
  const votes: Partial<Record<ModelId, Rating | null>> = {};
  for (const r of rated) votes[r.model] = r.kind === "fact" ? null : r.rating;
  const top = mostCommon(rated.flatMap((r) => (r.kind !== "fact" && r.rating ? [r.rating] : [])));
  return { kind, outcome: top ? (top.tied ? "split" : top.value) : null, votes };
}
