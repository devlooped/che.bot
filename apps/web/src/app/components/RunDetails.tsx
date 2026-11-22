import type { RunView, Source } from "@chebot/protocol";
import { t } from "../i18n/index.ts";
import { seatsOf } from "../view/derive.ts";
import { Fold } from "./Fold.tsx";
import { ModelMark, ModelName, WithMarks } from "./ModelMark.tsx";

/** The sources the answer cites, numbered as the paragraphs cite them, with who found each. */
export function Sources({ sources }: { sources: readonly Source[] }) {
  return (
    <Fold title={t.sources.title} open className="sources">
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
              <span className="source-by">
                <span className="sr-only">{t.sources.foundBy}</span>
                {[s.foundBy, ...(s.alsoFoundBy ?? [])].map((m) => (
                  <span key={m} className={`ink-${m}`}>
                    <ModelName model={m} />
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Fold>
  );
}

/** Who sat where: the models of this run, as it resolved them when it started. */
export function Panel({ view }: { view: RunView }) {
  const seats = seatsOf(view);
  if (seats.length === 0) return null;
  return (
    <Fold title={t.panel.title} className="panel">
      <dl className="panel-list">
        {seats.map((s) => (
          <div key={s.seat} className={`panel-seat${s.seat === "utility" ? "" : ` ink-${s.seat}`}`}>
            <dt>
              {s.seat !== "utility" && <ModelMark model={s.seat} size={11} />}
              {s.seat === "utility" ? t.panel.utility : t.models[s.seat]}
            </dt>
            <dd>
              <span className="model-id">{s.id}</span>
              {s.seat === "utility" && <span className="fine">{t.panel.utilityRole}</span>}
            </dd>
          </div>
        ))}
      </dl>
    </Fold>
  );
}

/** The notes about how the run went: the first thing "Cómo se armó la respuesta" says. */
export function Notes({ notes }: { notes: readonly string[] }) {
  if (notes.length === 0) return null;
  return (
    <section className="run-notes" aria-labelledby="notes-title" data-testid="notes">
      <h3 id="notes-title" className="run-notes-title">
        {t.flags.title}
      </h3>
      <ul>
        {notes.map((n) => (
          <li key={n}>
            <WithMarks text={n} />
          </li>
        ))}
      </ul>
    </section>
  );
}
