import type { RunView } from "@chebot/protocol";
import { MAX_ATTEMPTS, type RunSummary } from "../api.ts";
import { t } from "../i18n/index.ts";

/**
 * A run that failed: why, in plain words, and what can be done. Its owner reruns a paid question
 * once for free; an owner with no rerun left, or whose run was free, asks again. A reader who is
 * not the owner learns that the owner can try again.
 */
export function Failure({
  view,
  summary,
  busy,
  error,
  onRerun,
  onAskAgain,
}: {
  view: RunView;
  summary: RunSummary | null;
  busy: boolean;
  error: string | null;
  onRerun: () => void;
  onAskAgain: () => void;
}) {
  const reason = summary?.failure ?? null;
  const attempt = summary?.attempt ?? 1;
  const rerunLeft = view.paid && attempt < MAX_ATTEMPTS;
  return (
    <section className="failure" aria-labelledby="failure-title" data-testid="failure">
      <h2 id="failure-title" className="checkout-class">
        {t.failure.title}
      </h2>
      {reason && <p>{t.failure.reasons[reason]}</p>}
      {summary?.mine ? (
        rerunLeft ? (
          <>
            <p className="muted">{t.failure.rerunOffer}</p>
            <button
              type="button"
              className="button button-primary"
              disabled={busy}
              onClick={onRerun}
            >
              {busy ? t.failure.rerunning : t.failure.rerun}
            </button>
          </>
        ) : (
          <>
            <p className="muted">
              {view.paid ? `${t.failure.noRerunLeft} ${t.failure.askAgain}` : t.failure.askAgain}
            </p>
            <button
              type="button"
              className="button button-quiet"
              disabled={busy}
              onClick={onAskAgain}
            >
              {busy ? t.payment.askingAgain : t.payment.askAgain}
            </button>
          </>
        )
      ) : (
        rerunLeft && <p className="muted">{t.failure.reader}</p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
