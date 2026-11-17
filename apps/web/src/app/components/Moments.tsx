import type { RunView } from "@chebot/protocol";
import { useState } from "react";
import { t } from "../i18n/index.ts";
import { momentsByBatch } from "../view/derive.ts";

/**
 * The moments feed: the plain one-liners of the run, a group per stage, oldest first. On a phone
 * only the latest group shows until the reader asks for the rest.
 */
export function Moments({ view }: { view: RunView }) {
  const [all, setAll] = useState(false);
  const groups = momentsByBatch(view);
  const done = view.status === "completed";
  const older = groups.slice(0, -1).reduce((n, g) => n + g.texts.length, 0);
  return (
    <section className="moments" aria-labelledby="moments-title">
      <h2 id="moments-title" className="side-title">
        {done ? t.moments.titleDone : t.moments.title}
      </h2>
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
                    {text}
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
    </section>
  );
}
