import { MODELS_BY_NAME, type ModelId } from "@chebot/protocol";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Progress } from "../events/client.ts";
import { t } from "../i18n/index.ts";
import { paragraphsOf, Reader, type Reading } from "../view/reading.ts";
import { ModelMark } from "./ModelMark.tsx";

/** How often the readers move on: a few times per word. */
const TICK_MS = 100;

const reducedMotion = () =>
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * What each seat is thinking while its call goes: a paragraph per seat, ruled on its left in the
 * seat's ink, read at a reader's pace (reading.ts), that goes away once its answer landed. It is
 * not announced to screen readers (the stage line and the moments are): it changes too often.
 */
export function SeatsProgress({ progress }: { progress: Progress }) {
  // A seat shows once it said something readable.
  const seats = MODELS_BY_NAME.filter((model) => {
    const said = progress[model];
    return said && paragraphsOf(said.text).some((words) => words.length > 0);
  });
  if (seats.length === 0) return null;
  return (
    <section className="progress" aria-labelledby="progress-title" data-testid="progress">
      <h2 id="progress-title" className="side-title">
        {t.progress.title}
      </h2>
      <ul className="progress-list">
        {seats.map((model) => {
          const said = progress[model];
          return said ? (
            <SeatNote key={`${model}:${said.call}`} model={model} text={said.text} />
          ) : null;
        })}
      </ul>
    </section>
  );
}

/**
 * One seat's paragraph, for one call: a box of a fixed height (styles.css) that scrolls smoothly
 * to the latest line as the words come, a new paragraph fading in.
 */
function SeatNote({ model, text }: { model: ModelId; text: string }) {
  const reader = useRef(new Reader());
  const box = useRef<HTMLParagraphElement>(null);
  const [reading, setReading] = useState<Reading | null>(null);

  useEffect(() => {
    reader.current.feed(text);
  }, [text]);

  useEffect(() => {
    const move = () =>
      setReading((before) => {
        const now = reader.current.at(Date.now());
        return now?.text === before?.text && now?.paragraph === before?.paragraph ? before : now;
      });
    move();
    const timer = setInterval(move, TICK_MS);
    return () => clearInterval(timer);
  }, []);

  useLayoutEffect(() => {
    const element = box.current;
    if (!element || !reading) return;
    element.scrollTo({ top: element.scrollHeight, behavior: reducedMotion() ? "auto" : "smooth" });
  }, [reading]);

  if (!reading) return null;
  return (
    <li className={`progress-note ink-${model}`} data-seat={model}>
      <span className="progress-name">
        <ModelMark model={model} size={11} />
        {t.models[model]}
      </span>
      <p className="progress-text" ref={box}>
        <span key={reading.paragraph} className="progress-paragraph">
          {reading.text}
        </span>
      </p>
    </li>
  );
}
