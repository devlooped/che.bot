import type { RunView } from "@chebot/protocol";
import { useState } from "react";
import { t } from "../i18n/index.ts";
import { momentsByBatch } from "../view/derive.ts";
import { Fold } from "./Fold.tsx";
import { WithMarks } from "./ModelMark.tsx";
import { Notes } from "./RunDetails.tsx";

/**
 * The moments feed: the plain one-liners of the run, a group per stage, oldest first, after the
 * notes of what went wrong (flagNotes). On a phone only the latest group shows until the reader
 * asks for the rest. While the run goes it sits beside the answer; once done it is a closed
 * section of the main column, after the sources.
 */
export function Moments({ view, notes }: { view: RunView; notes: readonly string[] }) {
  const [all, setAll] = useState(false);
  const groups = momentsByBatch(view);
  const done = view.status === "completed";
  const older = groups.slice(0, -1).reduce((n, g) => n + g.texts.length, 0);
  // A run that failed before anything happened has nothing to tell here: the failure says it.
  if (groups.length === 0 && view.status === "failed") return null;
  const feed = (
    <>
      <Notes notes={notes} />
      {groups.length === 0 ? (
        <p className="muted">{t.moments.empty}</p>
      ) : (
        <ol className={`moment-groups${all ? " moment-groups-all" : ""}`} aria-live="polite">
          {groups.map((g, i) => (
            <li
              key={g.batch}
              className={i < groups.length - 1 ? "moment-group older" : "moment-group"}
            >
              <ul>
                {g.texts.map((text) => (
                  <li key={text} className="moment">
                    <WithMarks text={text} />
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
      {older > 0 && (
        <button
          type="button"
          className="button button-text moments-toggle"
          aria-expanded={all}
          onClick={() => setAll(!all)}
        >
          {all ? t.moments.showLess : t.moments.showAll(older)}
        </button>
      )}
    </>
  );
  if (done)
    return (
      <Fold title={t.moments.titleDone} className="moments">
        {feed}
      </Fold>
    );
  return (
    <section className="moments" aria-labelledby="moments-title">
      <h2 id="moments-title" className="side-title">
        {t.moments.title}
      </h2>
      {feed}
    </section>
  );
}
