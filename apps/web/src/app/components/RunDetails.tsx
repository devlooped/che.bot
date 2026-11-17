import type { RunView, Source } from "@chebot/protocol";
import { t } from "../i18n/index.ts";
import { seatsOf } from "../view/derive.ts";
import { ModelMark } from "./ModelMark.tsx";

/** The sources the answer cites, numbered as the paragraphs cite them, with who found each. */
export function Sources({ sources }: { sources: readonly Source[] }) {
  return (
    <section className="sources" aria-labelledby="sources-title">
      <h2 id="sources-title" className="section-title">
        {t.sources.title}
      </h2>
      {sources.length === 0 ? (
        <p className="muted">{t.sources.none}</p>
      ) : (
        <ol className="source-list">
          {sources.map((s, i) => (
            <li key={s.id} id={`src-${i + 1}`} className="source">
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="source-title">
                {s.title || s.url}
              </a>
              {s.quote && <q className="source-quote">{s.quote}</q>}
              <span className={`source-by ink-${s.foundBy}`}>
                <ModelMark model={s.foundBy} size={9} />
                {t.sources.foundBy(t.models[s.foundBy])}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** Who sat where: the models of this run, as it resolved them when it started. */
export function Panel({ view }: { view: RunView }) {
  const seats = seatsOf(view);
  if (seats.length === 0) return null;
  return (
    <section className="panel" aria-labelledby="panel-title">
      <h2 id="panel-title" className="section-title">
        {t.panel.title}
      </h2>
      <dl className="panel-list">
        {seats.map((s) => (
          <div key={s.seat} className={`panel-seat${s.seat === "utility" ? "" : ` ink-${s.seat}`}`}>
            <dt>
              {s.seat !== "utility" && <ModelMark model={s.seat} size={11} />}
              {s.seat === "utility" ? t.panel.utility : t.models[s.seat]}
            </dt>
            <dd>
              <span className="model-id">{s.id}</span>
              {s.effort && <span className="fine">{t.panel.effort(s.effort)}</span>}
              {s.seat === "utility" && <span className="fine">{t.panel.utilityRole}</span>}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** The notes about how the run went. */
export function Notes({ notes }: { notes: readonly string[] }) {
  if (notes.length === 0) return null;
  return (
    <ul className="run-notes">
      {notes.map((n) => (
        <li key={n}>{n}</li>
      ))}
    </ul>
  );
}
