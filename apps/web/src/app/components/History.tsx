import type { RunView } from "@chebot/protocol";
import { type CSSProperties, type ReactNode, useId, useMemo, useState } from "react";
import { t } from "../i18n/index.ts";
import { type ChartChange, chartHistoryOf, chartViewOf } from "../view/chart.ts";
import { type HistoryParagraph, historyOf } from "../view/history.ts";
import { ChartCanvas } from "./ChartCanvas.tsx";
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
 * The section of a history: a toggle, then a range that moves through the steps (touch, mouse, the
 * arrow keys) and two buttons that step one at a time, the label and what the step did, and the
 * content of the step.
 */
function Steps({
  texts,
  steps,
  children,
}: {
  texts: { title: string; show: string; hide: string; lede: string; slider: string };
  steps: readonly { label: string; what: string }[];
  children: (index: number) => ReactNode;
}) {
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
          {texts.title}
        </h2>
        <button
          type="button"
          className="button button-quiet history-toggle"
          aria-expanded={open}
          aria-controls={`${id}-body`}
          onClick={() => setOpen(!open)}
        >
          {open ? texts.hide : texts.show}
        </button>
      </div>
      <div id={`${id}-body`} className="history-body" hidden={!open}>
        {open && (
          <>
            <p className="fine">{texts.lede}</p>
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
                aria-label={texts.slider}
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
            {children(at)}
          </>
        )}
      </div>
    </section>
  );
}

function Change({ change }: { change: ChartChange }) {
  if (change.kind === "row") return <li className="hist-change">{change.text}</li>;
  const ink = change.by ? ` ink-${change.by}` : "";
  return (
    <li className={`hist-change hist-changed${ink}`}>
      <span className="hist-change-what">
        {change.by && <ModelMark model={change.by} size={10} />}
        {change.by
          ? t.chart.history.layerBy(change.name, t.models[change.by])
          : t.chart.history.layer(change.name)}
      </span>{" "}
      <span className="hist-text">
        <del>
          <span className="sr-only">{t.history.removed} </span>
          {change.before}
        </del>{" "}
        <ins>
          <span className="sr-only">{t.history.added} </span>
          {change.after}
        </ins>
      </span>
    </li>
  );
}

/** The chart at one step of the history, and what changed in that step. */
function ChartStep({
  view,
  version,
  changes,
}: {
  view: RunView;
  version: number;
  changes: readonly ChartChange[];
}) {
  const chart = useMemo(() => chartViewOf(view, version), [view, version]);
  if (!chart) return null;
  return (
    <div className="history-chart" data-testid="history-chart" data-version={version}>
      <p className="history-chart-title">{chart.title}</p>
      <ChartCanvas spec={chart.spec} data={chart.data} label={chart.label} />
      {chart.caption && <p className="chart-caption">{chart.caption}</p>}
      {changes.length > 0 && (
        <>
          <h3 className="chart-subtitle">{t.chart.history.changesTitle}</h3>
          <ul className="hist-changes" data-testid="history-changes">
            {changes.map((c) => (
              <Change key={c.kind === "row" ? c.text : c.name} change={c} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/**
 * The history slider (steps 32 and 41). A text answer: the text at each step of the run, from the
 * merged answers to the final wording, with what each step changed marked in the ink of the model
 * that proposed it. A chart: the chart at each step, whose marks move to the values of that step,
 * with the rows the sources settled and the layers the votes changed.
 */
export function History({ view }: { view: RunView }) {
  const prose = useMemo(() => (view.chart ? [] : historyOf(view)), [view]);
  const chart = useMemo(() => (view.chart ? chartHistoryOf(view) : []), [view]);
  if (view.chart)
    return (
      <Steps texts={t.chart.history} steps={chart}>
        {(at) => {
          const step = chart[at];
          return step ? (
            <ChartStep view={view} version={step.version} changes={step.changes} />
          ) : null;
        }}
      </Steps>
    );
  return (
    <Steps texts={t.history} steps={prose}>
      {(at) => (
        <div className="history-doc">
          {prose[at]?.paragraphs.map((p) => (
            <Paragraph key={p.id} p={p} />
          ))}
        </div>
      )}
    </Steps>
  );
}
