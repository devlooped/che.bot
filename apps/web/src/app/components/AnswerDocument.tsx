import { MODELS } from "@chebot/protocol";
import { useEffect, useRef, useState } from "react";
import { t } from "../i18n/index.ts";
import type { DocumentView, ParagraphView } from "../view/derive.ts";
import { ChartBlock } from "./ChartDocument.tsx";
import { DiscussionSheet } from "./Discussion.tsx";
import { Support, Votes, WithMarks } from "./ModelMark.tsx";

/** How long a new text stays highlighted (the CSS animation of .para-new is shorter). */
const HIGHLIGHT_MS = 1_500;

function Dissent({ paragraph }: { paragraph: ParagraphView }) {
  if (paragraph.dissent.length === 0) return null;
  return (
    <div className="dissent-notes">
      {paragraph.dissent.map((d) => {
        const silent = MODELS.filter((m) => !d.holders.includes(m) && !d.keep.includes(m));
        return (
          <aside key={d.suggestion} className={`dissent ink-${d.author}`} data-testid="dissent">
            <p className="dissent-title">{t.dissent.title}</p>
            <p>
              <WithMarks text={t.dissent.note(t.models[d.author], t.dissent.actions[d.op])} />
              {d.op !== "delete" && d.text && <q className="dissent-text">{d.text}</q>}
            </p>
            <p className="dissent-reason">{d.reason}</p>
            {d.state === "open" ? (
              <p className="fine">{t.dissent.open}</p>
            ) : (
              <p className="fine">
                <Votes holders={d.holders} keep={d.keep} silent={silent} />
              </p>
            )}
          </aside>
        );
      })}
    </div>
  );
}

/**
 * The answer: its paragraphs, with the margin marks of what was not unanimous or was discussed, and
 * the charts the models drew, each in its place among them. The help of the page (RunActions)
 * says what the marks are.
 */
export function AnswerDocument({
  doc,
  final,
  animate,
}: {
  doc: DocumentView;
  final: boolean;
  animate: boolean;
}) {
  const [open, setOpen] = useState<string | null>(null);
  // The margin marks, by paragraph: the one that opened the discussion gets the focus back.
  const marks = useRef(new Map<string, HTMLButtonElement>());
  // When each text was first shown: a paragraph whose text appears while the run is live gets a
  // short highlight, so the reader sees what just changed. The first render highlights nothing.
  const shown = useRef<Map<string, number> | null>(null);
  const now = Date.now();
  const isNew = (key: string) => {
    const at = shown.current?.get(key);
    return animate && shown.current !== null && (at === undefined || now - at < HIGHLIGHT_MS);
  };
  useEffect(() => {
    const first = shown.current === null;
    const map = shown.current ?? new Map<string, number>();
    for (const p of doc.paragraphs) {
      const key = `${p.id}:${p.text}`;
      if (!map.has(key)) map.set(key, first ? 0 : Date.now());
    }
    shown.current = map;
  });
  const opened = doc.paragraphs.find((p) => p.id === open) ?? null;
  return (
    <section className="answer" aria-labelledby="answer-title">
      {/* The answer needs no visible title under its question; screen readers keep the heading. */}
      <h2 id="answer-title" className="sr-only">
        {t.answer.title}
      </h2>
      {!final && <p className="muted">{t.answer.draftNote}</p>}
      <div className="doc">
        {doc.blocks.map((block) => {
          if (block.kind === "chart")
            return <ChartBlock key={block.chart.id} chart={block.chart} />;
          const p = block.paragraph;
          return (
            <div
              key={p.id}
              className={`para para-${p.status}${p.marked ? " para-marked" : ""}`}
              data-testid="paragraph"
              data-status={p.status}
            >
              <div className="gutter">
                {p.marked && (
                  <button
                    type="button"
                    className={`mark mark-${p.status}`}
                    aria-haspopup="dialog"
                    aria-expanded={open === p.id}
                    aria-label={t.answer.markLabel(
                      p.tally.for,
                      p.tally.of,
                      t.answer.statusName[p.status],
                    )}
                    data-testid="mark"
                    ref={(el) => {
                      if (el) marks.current.set(p.id, el);
                      else marks.current.delete(p.id);
                    }}
                    onClick={() => setOpen(p.id)}
                  >
                    <Support support={p.support} />
                    <svg
                      className="mark-open"
                      width={12}
                      height={12}
                      viewBox="0 0 12 12"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <circle cx="5" cy="5" r="3.6" />
                      <path d="M7.6 7.6L11 11" />
                    </svg>
                  </button>
                )}
              </div>
              <div className="para-body">
                <p
                  key={`${p.id}:${p.text}`}
                  className={isNew(`${p.id}:${p.text}`) ? "para-text para-new" : "para-text"}
                >
                  {p.text}
                  {p.sources.map((n) => (
                    <sup key={n} className="cite">
                      <a href={`#src-${n}`}>{n}</a>
                    </sup>
                  ))}
                </p>
                <Dissent paragraph={p} />
              </div>
            </div>
          );
        })}
      </div>
      {opened && (
        // Keyed by paragraph: another paragraph opens its own sheet, never the closing one.
        <DiscussionSheet
          key={opened.id}
          paragraph={opened}
          onClose={() => {
            setOpen((current) => (current === opened.id ? null : current));
            marks.current.get(opened.id)?.focus();
          }}
        />
      )}
    </section>
  );
}
