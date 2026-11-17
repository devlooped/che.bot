import { MODELS, type RunView } from "@chebot/protocol";
import { t } from "../i18n/index.ts";
import { seatChip, seatStatus } from "../view/derive.ts";
import { ModelMark } from "./ModelMark.tsx";

/** The ambient layer: the four seats with a status each, and the stage line. */
export function Seats({ view, line }: { view: RunView; line: string }) {
  return (
    <section className="seats" aria-label={t.seats.title}>
      <ul className="seat-list">
        {MODELS.map((model) => {
          const status = seatStatus(view, model);
          return (
            <li
              key={model}
              className={`seat seat-${status} ink-${model}`}
              data-model={model}
              data-status={status}
            >
              <span className="seat-avatar">
                <ModelMark model={model} size={18} filled={status !== "abstained"} />
              </span>
              <span className="seat-text">
                <span className="seat-name">{t.models[model]}</span>
                <span className="seat-chip">{seatChip(view, model)}</span>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="stage-line" aria-live="polite" data-testid="stage-line">
        {line}
      </p>
    </section>
  );
}
