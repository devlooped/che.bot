import { type RunVerdict, summaryPoints } from "@chebot/protocol";
import { t } from "../i18n/index.ts";

/**
 * The summary of an answer, on the card of its question and at the top of its page: a point for
 * each thing the person asked or stated, its sentence after the emoji of its verdict on a tag that
 * points at it. `verdict`, the run's, marks a summary written before the points.
 */
export function Summary({ text, verdict }: { text: string; verdict: RunVerdict | null }) {
  return (
    <ul className="summary" aria-label={t.verdict.summary} data-testid="summary">
      {summaryPoints(text, verdict).map((point, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: the points of a summary never change
        <li key={i} className="summary-point">
          <span className="summary-mark">{point.emoji ?? "•"}</span>
          <span className="summary-text">{point.text}</span>
        </li>
      ))}
    </ul>
  );
}
