import { MODELS } from "@chebot/protocol";
import { useEffect, useRef, useState } from "react";
import { t } from "../i18n/index.ts";
import type { DocumentView, ParagraphView } from "../view/derive.ts";
import { DiscussionSheet } from "./Discussion.tsx";
import { ModelMark, Support } from "./ModelMark.tsx";

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
            <p className="dissent-title">
              <ModelMark model={d.author} size={10} />
              {t.dissent.title}
            </p>
            <p>
              {t.dissent.note(t.models[d.author], t.dissent.actions[d.op])}
              {d.op !== "delete" && d.text && <q className="dissent-text">{d.text}</q>}
            </p>
            <p className="dissent-reason">{d.reason}</p>
            {d.state === "open" ? (
              <p className="fine">{t.dissent.open}</p>
            ) : (
              <p className="fine">
                {t.dissent.holders(t.modelNames(d.holders), d.holders.length)}{" "}
                {d.keep.length > 0 && t.dissent.against(t.modelNames(d.keep), d.keep.length)}{" "}
                {silent.length > 0 && t.dissent.silent(t.modelNames(silent))}
              </p>
            )}
          </aside>
        );
      })}
    </div>
  );
}

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
      <h2 id="answer-title" className="section-title">
        {t.answer.title}
      </h2>
      {!final && <p className="muted">{t.answer.draftNote}</p>}
      <p className="legend">{t.answer.legend}</p>
      <div className="doc">
        {doc.paragraphs.map((p) => (
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
                  onClick={() => setOpen(p.id)}
                >
                  <Support support={p.support} />
                  <span className="badge">{t.answer.badge(p.tally.for, p.tally.of)}</span>
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
        ))}
      </div>
      {opened && (
        // Keyed by paragraph: another paragraph opens its own sheet, never the closing one.
        <DiscussionSheet
          key={opened.id}
          paragraph={opened}
          onClose={() => setOpen((current) => (current === opened.id ? null : current))}
        />
      )}
    </section>
  );
}
