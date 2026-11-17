import { parseRunRef } from "@chebot/protocol";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "../auth/context.tsx";
import { isAdmin } from "../auth/types.ts";
import { AnswerDocument } from "../components/AnswerDocument.tsx";
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
  // The text of the answer, with its charts in their places among the paragraphs.
  const doc = useMemo(() => documentOf(view), [view]);
  // The summary says why a run failed and whether it may run again: read it again when it ends.
  useEffect(() => {
    if (view.status === "failed" || view.status === "expired") refresh();
  }, [view.status, refresh]);
  // The helper names a paid question beside its first steps: read the link again at each stage.
  const linkPending = summary?.link === null && view.status === "running";
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new stage asks for a new read
  useEffect(() => {
    if (linkPending) refresh();
  }, [view.stage, linkPending, refresh]);
  // The address bar shows the link to share: the run's link once it has one, its UUID before.
  const link = summary?.id === runId ? summary.link : null;
  const path = runPath(runId, link);
  useEffect(() => {
    if (link) known.set(link, runId);
    if (summary?.id === runId && window.location.pathname !== path)
      navigate(`${path}${window.location.search}${window.location.hash}`, { replace: true });
  }, [summary?.id, runId, link, path]);

  if (error?.kind === "not_found") return <RunNotFound />;

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
    <main className="page run" data-status={view.status}>
      <header className="run-head">
        {question ? (
          <h1 className="question">{question}</h1>
        ) : (
          <p className="muted">{t.common.loading}</p>
        )}
        <div className="run-share">
          <ShareLink url={new URL(path, window.location.origin).href} />
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
          {started && !doc && view.status !== "failed" && (
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
          {doc && <Sources sources={doc.sources} />}
          {started && <Panel view={view} />}
          {/* How the answer came to be, closed: for the reader who wants it, after what they need. */}
          {final && doc && <Moments view={view} />}
          {doc && <History view={view} />}
          {started && isAdmin(user) && <Spend runId={runId} running={view.status === "running"} />}
        </div>
      </div>
    </main>
  );
}
