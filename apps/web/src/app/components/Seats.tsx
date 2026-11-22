import { MODELS_BY_NAME, type RunView } from "@chebot/protocol";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { t } from "../i18n/index.ts";
import { seatChip, seatStatus } from "../view/derive.ts";
import { ModelMark } from "./ModelMark.tsx";

const reducedMotion = () =>
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Whether the seats step back, once the answer is done. A run that ends in front of the reader
 * gets there with a view transition (the seats keep their view-transition-name wherever the page
 * puts them); one that was done when the page opened is drawn settled at once.
 */
export function useSettled(view: RunView): boolean {
  const done = view.status === "completed";
  // Whether this page saw the run go: the catch-up of a finished run renders it done at once.
  const watched = useRef(false);
  if (view.status === "running") watched.current = true;
  const [settled, setSettled] = useState(false);
  const compact = done && (!watched.current || settled);
  useEffect(() => {
    if (!done || compact) return;
    const settle = () => flushSync(() => setSettled(true));
    if (typeof document.startViewTransition === "function" && !reducedMotion())
      document.startViewTransition(settle);
    else settle();
  }, [done, compact]);
  return compact;
}

/**
 * The ambient layer: the four seats with a status each, and the stage line. Compact (useSettled),
 * it is one line of small marks and names; the status and the stage line stay for screen readers.
 */
export function Seats({ view, line, compact }: { view: RunView; line: string; compact: boolean }) {
  return (
    <section className={compact ? "seats seats-compact" : "seats"} aria-label={t.seats.title}>
      <ul className="seat-list">
        {MODELS_BY_NAME.map((model) => {
          const status = seatStatus(view, model);
          const chip = seatChip(view, model);
          return (
            <li
              key={model}
              className={`seat seat-${status} ink-${model}`}
              data-model={model}
              data-status={status}
              title={compact ? t.seats.seat(t.models[model], chip) : undefined}
              style={{ viewTransitionName: `seat-${model}` } as CSSProperties}
            >
              <span className="seat-avatar">
                <ModelMark model={model} size={compact ? 12 : 18} />
              </span>
              <span className="seat-text">
                <span className="seat-name">{t.models[model]}</span>
                <span className={compact ? "seat-chip sr-only" : "seat-chip"}>{chip}</span>
              </span>
            </li>
          );
        })}
      </ul>
      <p
        className={compact ? "stage-line sr-only" : "stage-line"}
        aria-live="polite"
        data-testid="stage-line"
      >
        {line}
      </p>
    </section>
  );
}
