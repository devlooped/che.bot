import { useEffect, useMemo, useState } from "react";
import { useSession } from "../auth/context.tsx";
import { isAdmin } from "../auth/types.ts";
import { AnswerDocument } from "../components/AnswerDocument.tsx";
import { ChartDocument } from "../components/ChartDocument.tsx";
import { Checkout } from "../components/Checkout.tsx";
import { Failure } from "../components/Failure.tsx";
import { History } from "../components/History.tsx";
import { Moments } from "../components/Moments.tsx";
import { Panel, Sources } from "../components/RunDetails.tsx";
import { Seats } from "../components/Seats.tsx";
import { ShareLink } from "../components/ShareLink.tsx";
import { Spend } from "../components/Spend.tsx";
import { useRun } from "../events/useRun.ts";
import { t } from "../i18n/index.ts";
import { Link, navigate } from "../router/index.tsx";
import { runPath } from "../routes.tsx";
import { chartViewOf } from "../view/chart.ts";
import { documentOf, flagNotes, stageLine } from "../view/derive.ts";
import { errorText } from "../view/errors.ts";

/**
 * The page of a run, by its link: readable by anyone. Its owner pays here, asks again after an
 * expired payment, and reruns a paid question that failed.
 */
export function RunPage({ params }: { params: Record<string, string> }) {
  const runId = (params.id ?? "").toLowerCase();
  const { api, user, local } = useSession();
  const { stream, summary, error, refresh } = useRun(runId);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  /** Asking again or rerunning: the button waits for the API. */
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const { view, connection } = stream;
  // A chart run answers with its chart (step 41); any other, with the text.
  const chart = useMemo(() => (view.chart ? chartViewOf(view) : null), [view]);
  const doc = useMemo(() => (view.chart ? null : documentOf(view)), [view]);
  // The summary says why a run failed and whether it may run again: read it again when it ends.
  useEffect(() => {
    if (view.status === "failed" || view.status === "expired") refresh();
  }, [view.status, refresh]);

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

  /**
   * The same question as a new one: a new quote, on its own page. A chart of web data is asked for
   * again; a chart of the user's table needs the file again, so the ask page takes it.
   */
  async function askAgain() {
    if (summary?.chart === "user") return navigate("/");
    setBusy(true);
    setActionError(null);
    try {
      const quote = await api.ask(question, summary?.chart === "web" ? {} : null);
      navigate(runPath(quote.runId));
    } catch (err) {
      setActionError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function rerun() {
    setBusy(true);
    setActionError(null);
    try {
      await api.rerun(runId);
      refresh();
    } catch (err) {
      setActionError(errorText(err));
    } finally {
      setBusy(false);
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
          <ShareLink url={new URL(runPath(runId), window.location.origin).href} />
          {view.status === "running" && <p className="fine">{t.run.takesMinutes}</p>}
        </div>
        {(summary?.attempt ?? 1) > 1 && view.status !== "failed" && (
          <p className="fine">{t.failure.secondAttempt}</p>
        )}
      </header>

      <div className="run-grid">
        <div className="run-side">
          <Seats view={view} line={line} />
          {(connection === "reconnecting" || connection === "polling") && !final && (
            <p className="connection" role="status">
              {connection === "reconnecting" ? t.connection.reconnecting : t.connection.polling}
            </p>
          )}
          {/* While the run goes, what happens shows beside it; once done, it moves into the main column. */}
          {started && !final && <Moments view={view} />}
        </div>

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
              error={payError ?? actionError}
              onPay={pay}
              onSimulatePayment={local ? () => local.simulatePayment(runId) : undefined}
              onSimulateExpiry={local ? () => local.simulateExpiry(runId) : undefined}
              askingAgain={busy}
              onAskAgain={askAgain}
            />
          )}
          {view.status === "failed" && (
            <Failure
              view={view}
              summary={summary}
              busy={busy}
              error={actionError}
              onRerun={rerun}
              onAskAgain={askAgain}
            />
          )}
          {started && !doc && !chart && view.status !== "failed" && (
            <p className="doc-empty">{t.answer.noDocument}</p>
          )}
          {doc && (
            <AnswerDocument
              doc={doc}
              final={final}
              animate={live}
              notes={flagNotes(view, doc.answer)}
            />
          )}
          {chart && (
            <ChartDocument chart={chart} final={final} notes={flagNotes(view, chart.answer)} />
          )}
          {doc && <Sources sources={doc.sources} />}
          {chart?.origin === "web" && <Sources sources={chart.answer.sources} />}
          {started && <Panel view={view} />}
          {/* How the answer came to be, closed: for the reader who wants it, after what they need. */}
          {final && (doc || chart) && <Moments view={view} />}
          {(doc || chart) && <History view={view} />}
          {started && isAdmin(user) && <Spend runId={runId} running={view.status === "running"} />}
        </div>
      </div>
    </main>
  );
}
