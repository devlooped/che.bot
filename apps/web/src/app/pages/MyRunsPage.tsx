import { useEffect, useRef, useState } from "react";
import type { MyRun } from "../api.ts";
import { useSession } from "../auth/context.tsx";
import { ConfirmSheet } from "../components/ConfirmSheet.tsx";
import { ShareLink } from "../components/ShareLink.tsx";
import { t } from "../i18n/index.ts";
import { Link } from "../router/index.tsx";
import { runPath } from "../routes.tsx";
import { errorText } from "../view/errors.ts";

/** A question of the list: its link, status and price; a deleted one, its restore button. */
function Row({
  run,
  onDelete,
  onRestore,
}: {
  run: MyRun;
  onDelete: (opener: HTMLButtonElement) => void;
  onRestore: () => void;
}) {
  const questionId = `q-${run.id}`;
  return (
    <li className="my-run" data-testid="my-run">
      <Link to={runPath(run.id, run.link)} id={questionId} className="my-run-question">
        {run.question}
      </Link>
      <p className="my-run-meta">
        <span className={`my-run-status status-${run.status}`}>{t.myRuns.status[run.status]}</span>
        <span>{t.myRuns.asked(t.date(run.createdAt))}</span>
        {run.amount !== null && <span>{t.myRuns.price(t.money(run.amount, "ARS"))}</span>}
      </p>
      <div className="my-run-actions">
        {run.deletedAt === null ? (
          <>
            <ShareLink
              url={new URL(runPath(run.id, run.link), window.location.origin).href}
              describedBy={questionId}
            />
            <button
              type="button"
              className="button button-text"
              aria-describedby={questionId}
              onClick={(e) => onDelete(e.currentTarget)}
            >
              {t.myRuns.remove}
            </button>
          </>
        ) : (
          <button
            type="button"
            className="button button-text"
            aria-describedby={questionId}
            onClick={onRestore}
          >
            {t.myRuns.restore}
          </button>
        )}
      </div>
    </li>
  );
}

/**
 * "Mis preguntas" (step 33): the user's questions, each with its link, and deleting one; the
 * deleted ones after the others, each to restore.
 */
export function MyRunsPage() {
  const { ready, user, api, signIn } = useSession();
  const [runs, setRuns] = useState<MyRun[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<MyRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [said, setSaid] = useState("");
  const opener = useRef<HTMLButtonElement | null>(null);
  const title = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!ready || !user) return;
    let live = true;
    setRuns(null);
    api
      .myRuns()
      .then((r) => live && setRuns(r))
      .catch((e: unknown) => live && setError(errorText(e)));
    return () => {
      live = false;
    };
  }, [api, ready, user]);

  /** Marks a run of the list deleted or not, as the API just did. */
  const mark = (id: string, deletedAt: string | null) =>
    setRuns((list) => list?.map((r) => (r.id === id ? { ...r, deletedAt } : r)) ?? null);

  async function remove(run: MyRun) {
    setBusy(true);
    setDeleteError(null);
    try {
      await api.remove(run.id);
      mark(run.id, new Date().toISOString());
      opener.current = null;
      setDeleting(null);
      setSaid(t.myRuns.removed);
      // The row moved to the deleted ones: the focus goes back to the top of the list.
      title.current?.focus();
    } catch (e) {
      setDeleteError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function restore(run: MyRun) {
    setRestoreError(null);
    try {
      await api.restore(run.id);
      mark(run.id, null);
      setSaid(t.myRuns.restored);
      title.current?.focus();
    } catch (e) {
      setRestoreError(errorText(e));
    }
  }

  const active = runs?.filter((r) => r.deletedAt === null) ?? [];
  const deleted = runs?.filter((r) => r.deletedAt !== null) ?? [];
  const row = (run: MyRun) => (
    <Row
      key={run.id}
      run={run}
      onDelete={(button) => {
        opener.current = button;
        setDeleteError(null);
        setDeleting(run);
      }}
      onRestore={() => restore(run)}
    />
  );

  return (
    <main className="page page-narrow my-runs">
      <h1 className="page-title" ref={title} tabIndex={-1}>
        {t.myRuns.title}
      </h1>
      <p className="sr-only" role="status">
        {said}
      </p>
      {!ready ? (
        <p className="muted">{t.common.loading}</p>
      ) : !user ? (
        <section className="signin-card">
          <p>{t.myRuns.signIn}</p>
          <button type="button" className="button button-primary" onClick={() => signIn()}>
            {t.nav.signIn}
          </button>
        </section>
      ) : error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : runs === null ? (
        <p className="muted">{t.common.loading}</p>
      ) : (
        <>
          {restoreError && (
            <p className="error" role="alert">
              {restoreError}
            </p>
          )}
          {active.length === 0 ? (
            <section className="empty">
              <p>{t.myRuns.empty}</p>
              <Link to="/new" className="button button-primary">
                {t.myRuns.askFirst}
              </Link>
            </section>
          ) : (
            <>
              <p className="muted my-runs-lede">{t.myRuns.lede}</p>
              <ul className="my-run-list">{active.map(row)}</ul>
            </>
          )}
          {deleted.length > 0 && (
            <section className="my-runs-deleted" aria-labelledby="deleted-title">
              <h2 id="deleted-title" className="section-title">
                {t.myRuns.deletedTitle}
              </h2>
              <p className="muted my-runs-lede">{t.myRuns.deletedLede}</p>
              <ul className="my-run-list" data-testid="deleted-runs">
                {deleted.map(row)}
              </ul>
            </section>
          )}
        </>
      )}
      {deleting && (
        <ConfirmSheet
          key={deleting.id}
          title={t.myRuns.confirmTitle}
          question={deleting.question}
          body={t.myRuns.confirmBody}
          confirm={t.myRuns.confirm}
          confirming={t.myRuns.removing}
          danger
          busy={busy}
          error={deleteError}
          onConfirm={() => remove(deleting)}
          onClose={() => {
            setDeleting(null);
            opener.current?.focus();
          }}
        />
      )}
    </main>
  );
}
