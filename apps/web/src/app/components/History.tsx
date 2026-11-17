import type { RunView } from "@chebot/protocol";
import { type CSSProperties, useId, useMemo, useState } from "react";
import { t } from "../i18n/index.ts";
import { type HistoryParagraph, historyOf } from "../view/history.ts";
import { ModelMark } from "./ModelMark.tsx";

function Paragraph({ p }: { p: HistoryParagraph }) {
  const ink = p.by ? ` ink-${p.by}` : "";
  return (
    <div className={`hist-para hist-${p.change}${ink}`} data-testid="history-paragraph">
      {(p.change === "added" || p.change === "removed") && (
        <p className="hist-tag">
          {p.by && <ModelMark model={p.by} size={10} />}
          {p.change === "added" ? t.history.newParagraph : t.history.removedParagraph}
        </p>
      )}
      <p className="hist-text">
        {p.pieces.map((piece, i) => {
          const key = `${i}:${piece.kind}`;
          if (piece.kind === "same") return <span key={key}>{piece.text}</span>;
          if (piece.kind === "added")
            return (
              <ins key={key}>
                <span className="sr-only">{t.history.added} </span>
                {piece.text}
              </ins>
            );
          return (
            <del key={key}>
              <span className="sr-only">{t.history.removed} </span>
              {piece.text}
            </del>
          );
        })}
      </p>
    </div>
  );
}

/**
 * The history slider (step 32): the text at each step of the run, from the merged answers to the
 * final wording, with what each step changed marked in the ink of the model that proposed it. A
 * range moves through the steps (touch, mouse, the arrow keys); two buttons step one at a time.
 */
export function History({ view }: { view: RunView }) {
  const steps = useMemo(() => historyOf(view), [view]);
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const id = useId();
  if (steps.length < 2) return null;
  const at = Math.min(index, steps.length - 1);
  const step = steps[at];
  if (!step) return null;
  const position = t.history.position(at + 1, steps.length);
  return (
    <section className="history" aria-labelledby={`${id}-title`}>
      <div className="history-head">
        <h2 id={`${id}-title`} className="section-title">
          {t.history.title}
        </h2>
        <button
          type="button"
          className="button button-quiet history-toggle"
          aria-expanded={open}
          aria-controls={`${id}-body`}
          onClick={() => setOpen(!open)}
        >
          {open ? t.history.hide : t.history.show}
        </button>
      </div>
      <div id={`${id}-body`} className="history-body" hidden={!open}>
        {open && (
          <>
            <p className="fine">{t.history.lede}</p>
            <div className="history-controls">
              <button
                type="button"
                className="button button-text"
                disabled={at === 0}
                onClick={() => setIndex(at - 1)}
              >
                {t.history.previous}
              </button>
              <input
                type="range"
                className="history-range"
                min={0}
                max={steps.length - 1}
                step={1}
                value={at}
                aria-label={t.history.slider}
                aria-valuetext={`${step.label}. ${position}`}
                onChange={(e) => setIndex(Number(e.target.value))}
                style={{ "--fill": `${(at / (steps.length - 1)) * 100}%` } as CSSProperties}
              />
              <button
                type="button"
                className="button button-text"
                disabled={at === steps.length - 1}
                onClick={() => setIndex(at + 1)}
              >
                {t.history.next}
              </button>
            </div>
            <div className="history-step" aria-live="polite">
              <p className="history-label" data-testid="history-label">
                {step.label} <span className="fine">{position}</span>
              </p>
              <p className="history-what">{step.what}</p>
            </div>
            <div className="history-doc">
              {step.paragraphs.map((p) => (
                <Paragraph key={p.id} p={p} />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
