import { MODELS_BY_NAME } from "@chebot/protocol";
import type { Progress } from "../events/client.ts";
import { t } from "../i18n/index.ts";
import { ModelMark } from "./ModelMark.tsx";

/**
 * What each seat is thinking while its call goes: a paragraph per seat, ruled on its left in the
 * seat's ink, that changes as the model writes and goes away once its answer landed. It is not
 * announced to screen readers (the stage line and the moments are): it changes too often.
 */
export function SeatsProgress({ progress }: { progress: Progress }) {
  const seats = MODELS_BY_NAME.filter((model) => progress[model]);
  if (seats.length === 0) return null;
  return (
    <section className="progress" aria-labelledby="progress-title" data-testid="progress">
      <h2 id="progress-title" className="side-title">
        {t.progress.title}
      </h2>
      <ul className="progress-list">
        {seats.map((model) => (
          <li key={model} className={`progress-note ink-${model}`} data-seat={model}>
            <span className="progress-name">
              <ModelMark model={model} size={11} />
              {t.models[model]}
            </span>
            <p className="progress-text">{progress[model]}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
