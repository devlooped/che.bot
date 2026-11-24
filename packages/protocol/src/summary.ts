import type { QuestionKind, Rating } from "./model.ts";
import { type RunVerdict, readVerdict, verdictEmoji } from "./verdict.ts";

// The summary of an answer, for the card of its question and its page: one point for each thing
// the person asked or stated, each a sentence led by the emoji of its verdict. It is kept and sent
// as plain text, a point per line ("👍 Sí, ...\n👎 No, ..."), so that the preview of a shared link
// reads as it is. A summary written before the points is one sentence without an emoji: it reads
// as one point with the emoji of the run's verdict.

/** The points of a summary, at most: the main things a person asked or stated. */
export const SUMMARY_POINTS = 5;

/** The longest sentence of a point, in characters: a longer one is cut at a word. */
export const POINT_CHARS = 280;

/** A point of a summary as the helper returns it (see tldrSchema). */
export interface PointOutput {
  kind: QuestionKind;
  rating: Rating | "none";
  text: string;
}

/** A point of a summary, to show: its sentence, and the emoji of its verdict when it has one. */
export interface SummaryPoint {
  emoji: string | null;
  text: string;
}

/** One line, at most POINT_CHARS. */
function sentence(text: string): string {
  const line = text.replace(/\s+/g, " ").trim();
  if (line.length <= POINT_CHARS) return line;
  const cut = line.slice(0, POINT_CHARS - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), POINT_CHARS / 2)).trimEnd()}…`;
}

/**
 * The summary as it is kept, from the helper's points: a line each, at most SUMMARY_POINTS; null
 * when nothing is left. A lone point takes the emoji of the run's verdict, the one over the
 * picture of the card; each of several keeps the helper's.
 */
export function tldrOf(points: readonly PointOutput[], verdict: RunVerdict | null): string | null {
  const kept = points
    .map((point) => ({ ...readVerdict(point), text: sentence(point.text) }))
    .filter((point) => point.text)
    .slice(0, SUMMARY_POINTS);
  const whole = kept.length === 1 ? verdictEmoji(verdict) : null;
  const lines = kept.map((point) => {
    const emoji = whole ?? verdictEmoji({ kind: point.kind, outcome: point.rating });
    return emoji ? `${emoji} ${point.text}` : point.text;
  });
  return lines.length ? lines.join("\n") : null;
}

/** The emoji a line may start with: every one `verdictEmoji` gives. */
const EMOJI = ["👍", "👎", "⚠️", "🤔", "❓", "📊", "⚖️"];

/** The points of a summary as it is kept; `verdict`, the run's, for a line without an emoji. */
export function summaryPoints(tldr: string, verdict: RunVerdict | null): SummaryPoint[] {
  return tldr
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const emoji = EMOJI.find((e) => line.startsWith(`${e} `));
      return emoji
        ? { emoji, text: line.slice(emoji.length).trim() }
        : { emoji: verdictEmoji(verdict), text: line };
    });
}
