import { parseRunRef, verdictOf } from "@chebot/protocol";
import { useEffect, useMemo, useState } from "react";
import { imagePath } from "../api.ts";
import { useSession } from "../auth/context.tsx";
import { isAdmin } from "../auth/types.ts";
import { AnswerDocument } from "../components/AnswerDocument.tsx";
import { Checkout } from "../components/Checkout.tsx";
import { Failure } from "../components/Failure.tsx";
import { History } from "../components/History.tsx";
import { Moments } from "../components/Moments.tsx";
import { RunActions } from "../components/RunActions.tsx";
import { Panel, Sources } from "../components/RunDetails.tsx";
import { Seats, useSettled } from "../components/Seats.tsx";
import { Spend } from "../components/Spend.tsx";
import { VerdictOverlay, verdictText } from "../components/Verdict.tsx";
import { useRun } from "../events/useRun.ts";
import { t } from "../i18n/index.ts";
import { Link, navigate } from "../router/index.tsx";
import { runPath } from "../routes.tsx";
import { documentOf, flagNotes, stageLine } from "../view/derive.ts";
import { errorText } from "../view/errors.ts";

/** The runs of the links this page resolved or learned: a link the page shows needs no new read. */
const known = new Map<string, string>();

function RunNotFound() {
  return (
    <main className="page page-narrow">
      <h1 className="page-title">{t.errors.runNotFound}</h1>
      <p>
        <Link to="/">{t.notFound.back}</Link>
      </p>
    </main>
  );
}

/** A run its owner deleted, to anyone else. */
function RunDeleted() {
  return (
    <main className="page page-narrow" data-testid="run-gone">
      <h1 className="page-title">{t.run.deletedTitle}</h1>
      <p>{t.run.deletedBody}</p>
      <p>
        <Link to="/">{t.notFound.back}</Link>
      </p>
    </main>
  );
}

/**
 * The page of a run, by its UUID or its link (run-link.ts of the protocol): readable by anyone. A
 * link is resolved to the run's UUID first; the short part alone resolves too.
 */
export function RunPage({ params }: { params: Record<string, string> }) {
  const ref = params.id ?? "";
  const parsed = parseRunRef(ref);
  const { api } = useSession();
  const [found, setFound] = useState<{ ref: string; id: string | null } | null>(null);
  const cached = known.get(ref);
  useEffect(() => {
    if (parsed?.kind !== "link" || cached) return;
    let live = true;
    api.link(ref).then(
      (run) => live && setFound({ ref, id: run.id }),
      () => live && setFound({ ref, id: null }),
    );
    return () => {
      live = false;
    };
  }, [api, ref, parsed?.kind, cached]);

  if (parsed?.kind === "uuid") return <RunView key={parsed.id} runId={parsed.id} />;
  if (cached) return <RunView key={cached} runId={cached} />;
  if (parsed && found?.ref !== ref)
    return (
      <main className="page page-narrow">
        <p className="muted">{t.common.loading}</p>
      </main>
    );
  if (!found?.id) return <RunNotFound />;
  known.set(ref, found.id);
  return <RunView key={found.id} runId={found.id} />;
}

/**
 * A run, by its UUID: its owner pays here, asks again after an expired payment, and reruns a paid
 * question that failed.
 */
function RunView({ runId }: { runId: string }) {
  const { api, user, local } = useSession();
  const { stream, summary, error, refresh } = useRun(runId);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  /** Asking again or rerunning: the button waits for the API. */
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const { view, connection } = stream;
  // Done, the seats step back under the bar of the question, and the page is one centered column.
  const settled = useSettled(view);
  // The text of the answer, with its charts in their places among the paragraphs.
  const doc = useMemo(() => documentOf(view), [view]);
  // The summary says why a run failed and whether it may run again, and its picture may have come
  // since: read it again when it ends.
  useEffect(() => {
    if (view.status === "failed" || view.status === "expired" || view.status === "completed")
      refresh();
  }, [view.status, refresh]);
  // The helper names a paid question and its picture is drawn beside its first steps: read the
  // summary again at each stage until it has both.
  const pending = (summary?.link === null || summary?.image === null) && view.status === "running";
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new stage asks for a new read
  useEffect(() => {
    if (pending) refresh();
  }, [view.stage, pending, refresh]);
  // The address bar shows the link to share: the run's link once it has one, its UUID before.
  const link = summary?.id === runId ? summary.link : null;
  const path = runPath(runId, link);
  useEffect(() => {
    if (link) known.set(link, runId);
    if (summary?.id === runId && window.location.pathname !== path)
      navigate(`${path}${window.location.search}${window.location.hash}`, { replace: true });
  }, [summary?.id, runId, link, path]);
  // A deleted run that was asked again leads to the new one.
  const replacedBy = error?.kind === "deleted" ? error.replacedBy : null;
  useEffect(() => {
    if (replacedBy) navigate(runPath(replacedBy), { replace: true });
  }, [replacedBy]);
  // The notes of what went wrong open "Cómo se armó la respuesta".
  const notes = useMemo(() => (doc ? flagNotes(view, doc.answer) : []), [view, doc]);

  if (error?.kind === "not_found") return <RunNotFound />;
  if (error?.kind === "deleted") return replacedBy ? null : <RunDeleted />;

  const question = view.question ?? summary?.question ?? "";
  const started = view.runId !== null;
  const line = stageLine(view, summary?.status === "awaiting_payment");
  const live = connection === "live" || connection === "polling";
  const final = view.status === "completed";
  // The card of the question, as on the home page: its picture, and its verdict once it is answered.
  const verdict = final ? verdictOf(view.drafts) : null;
  const image = summary?.id === runId ? summary.image : null;
  // The stream says first when a run ends; the summary, whether it was quoted before any event.
  const ended =
    view.status === "completed" || view.status === "failed" || view.status === "expired";
  const inProgress =
    !ended &&
    (summary?.status === "quoted" ||
      summary?.status === "awaiting_payment" ||
      summary?.status === "running");

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

  /** The same question as a new one: a new quote, on its own page. */
  async function askAgain() {
    setBusy(true);
    setActionError(null);
    try {
      const quote = await api.ask(question);
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
    <main className={settled ? "page run run-settled" : "page run"} data-status={view.status}>
      <header className="run-head">
        {(image || verdict) && (
          <figure className="run-card" data-testid="run-card">
            <span className="card-picture">
              {image ? (
                <img src={imagePath(runId, image)} alt="" width={512} height={512} />
              ) : (
                <span className="card-placeholder" aria-hidden="true" />
              )}
              {verdict && <VerdictOverlay verdict={verdict} />}
            </span>
            {verdict && <figcaption className="sr-only">{verdictText(verdict)}</figcaption>}
          </figure>
        )}
        {question ? (
          <h1 className="question">{question}</h1>
        ) : (
          <p className="muted">{t.common.loading}</p>
        )}
        {final && view.tldr && (
          <p className="run-tldr" data-testid="tldr">
            <span className="tldr-label">{t.verdict.tldr}</span> {view.tldr}
          </p>
        )}
        <div className="run-share">
          <RunActions
            runId={runId}
            question={question}
            url={new URL(path, window.location.origin).href}
            mine={summary?.mine ?? false}
            deleted={summary?.deleted ?? false}
            inProgress={inProgress}
            answered={view.status === "completed" || view.status === "failed"}
            free={isAdmin(user)}
            drawable={started && ((summary?.mine ?? false) || isAdmin(user))}
            hasImage={(summary?.image ?? null) !== null}
            onChange={refresh}
          />
          {view.status === "running" && <p className="fine">{t.run.takesMinutes}</p>}
        </div>
        {(summary?.attempt ?? 1) > 1 && view.status !== "failed" && (
          <p className="fine">{t.failure.secondAttempt}</p>
        )}
        {settled && <Seats view={view} line={line} compact />}
      </header>

      <div className="run-grid">
        {!settled && (
          <div className="run-side">
            <Seats view={view} line={line} compact={false} />
            {(connection === "reconnecting" || connection === "polling") && !final && (
              <p className="connection" role="status">
                {connection === "reconnecting" ? t.connection.reconnecting : t.connection.polling}
              </p>
            )}
            {/* While the run goes, what happens shows beside it; once done, it moves into the main column. */}
            {started && !final && <Moments view={view} notes={notes} />}
          </div>
        )}

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
          {started && !doc && view.status !== "failed" && (
            <p className="doc-empty">{t.answer.noDocument}</p>
          )}
          {doc && <AnswerDocument doc={doc} final={final} animate={live} />}
          {doc && <Sources sources={doc.sources} />}
          {/* How the answer came to be, closed: for the reader who wants it, after what they need. */}
          {final && doc && <Moments view={view} notes={notes} />}
          {doc && <History view={view} />}
          {started && isAdmin(user) && <Spend runId={runId} running={view.status === "running"} />}
          {/* Who sat where: the last thing on the page. */}
          {started && <Panel view={view} />}
        </div>
      </div>
    </main>
  );
}
