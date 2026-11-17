import { useMemo, useState } from "react";
import { useSession } from "../auth/context.tsx";
import { isAdmin } from "../auth/types.ts";
import { AnswerDocument } from "../components/AnswerDocument.tsx";
import { Checkout } from "../components/Checkout.tsx";
import { Moments } from "../components/Moments.tsx";
import { Notes, Panel, Sources } from "../components/RunDetails.tsx";
import { Seats } from "../components/Seats.tsx";
import { useRun } from "../events/useRun.ts";
import { t } from "../i18n/index.ts";
import { Link } from "../router/index.tsx";
import { documentOf, flagNotes, stageLine } from "../view/derive.ts";
import { errorText } from "../view/errors.ts";

function ShareLink() {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="button button-quiet share"
      onClick={() => {
        navigator.clipboard
          ?.writeText(window.location.href)
          .then(() => setCopied(true))
          .catch(() => {});
      }}
    >
      {copied ? t.common.linkCopied : t.common.copyLink}
    </button>
  );
}

/** The page of a run, by its link: readable by anyone; its owner pays here. */
export function RunPage({ params }: { params: Record<string, string> }) {
  const runId = (params.id ?? "").toLowerCase();
  const { api, user, auth } = useSession();
  const { stream, summary, error, refresh } = useRun(runId);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const { view, connection } = stream;
  const doc = useMemo(() => documentOf(view), [view]);

  if (error?.kind === "not_found")
    return (
      <main className="page page-narrow">
        <h1 className="page-title">{t.errors.runNotFound}</h1>
        <p>
          <Link to="/">{t.notFound.back}</Link>
        </p>
      </main>
    );

  const question = view.question ?? summary?.question ?? "";
  const started = view.runId !== null;
  const line = stageLine(view, summary?.status === "awaiting_payment");
  const live = connection === "live" || connection === "polling";
  const final = view.status === "completed";

  async function pay() {
    setPaying(true);
    setPayError(null);
    try {
      await api.pay(runId);
      refresh();
    } catch (err) {
      setPayError(errorText(err));
    } finally {
      setPaying(false);
    }
  }

  return (
    <main className="page run" data-status={view.status}>
      <header className="run-head">
        {question ? (
          <h1 className="question">{question}</h1>
        ) : (
          <p className="muted">{t.common.loading}</p>
        )}
        <div className="run-share">
          <ShareLink />
          <p className="fine">{t.run.shareNote}</p>
        </div>
      </header>

      <div className="run-grid">
        <aside className="run-side">
          <Seats view={view} line={line} />
          {(connection === "reconnecting" || connection === "polling") && !final && (
            <p className="connection" role="status">
              {connection === "reconnecting" ? t.connection.reconnecting : t.connection.polling}
            </p>
          )}
          {started && <Moments view={view} />}
        </aside>

        <div className="run-main">
          {error && (
            <p className="error" role="alert">
              {errorText(error)}
            </p>
          )}
          {!started && summary && (
            <Checkout
              view={view}
              summary={summary}
              admin={isAdmin(user)}
              paying={paying}
              error={payError}
              onPay={pay}
              onSimulatePayment={
                auth?.simulatePayment ? () => auth.simulatePayment?.(runId) : undefined
              }
            />
          )}
          {started && !doc && view.status !== "failed" && (
            <p className="doc-empty">{t.answer.noDocument}</p>
          )}
          {doc && (
            <>
              <AnswerDocument doc={doc} final={final} animate={live} />
              <Notes notes={flagNotes(doc.answer)} />
              <Sources sources={doc.sources} />
            </>
          )}
          {started && <Panel view={view} />}
        </div>
      </div>
    </main>
  );
}
