import { useEffect, useRef, useState } from "react";
import type { MyRun } from "../api.ts";
import { useSession } from "../auth/context.tsx";
import { CopyLink } from "../components/CopyLink.tsx";
import { t } from "../i18n/index.ts";
import { Link } from "../router/index.tsx";
import { runPath } from "../routes.tsx";
import { errorText } from "../view/errors.ts";

/** Asks before a question is deleted: its answer and its link stop working for everyone. */
function ConfirmDelete({
  run,
  busy,
  error,
  onConfirm,
  onClose,
}: {
  run: MyRun;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="sheet confirm-sheet"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-body"
      onClose={onClose}
    >
      <div className="sheet-body">
        <h2 id="confirm-title" className="sheet-title">
          {t.myRuns.confirmTitle}
        </h2>
        <blockquote className="sheet-quote">{run.question}</blockquote>
        <p id="confirm-body">{t.myRuns.confirmBody}</p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="confirm-actions">
          {/* The safe choice has the focus first. */}
          <button
            type="button"
            className="button button-quiet"
            // biome-ignore lint/a11y/noAutofocus: a confirmation starts on its safe choice
            autoFocus
            onClick={() => ref.current?.close()}
          >
            {t.common.cancel}
          </button>
          <button
            type="button"
            className="button button-danger"
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? t.myRuns.removing : t.myRuns.confirm}
          </button>
        </div>
      </div>
    </dialog>
  );
}

function Row({ run, onDelete }: { run: MyRun; onDelete: (opener: HTMLButtonElement) => void }) {
  const questionId = `q-${run.id}`;
  return (
    <li className="my-run" data-testid="my-run">
      <Link to={runPath(run.id)} id={questionId} className="my-run-question">
        {run.question}
      </Link>
      <p className="my-run-meta">
        <span className={`my-run-status status-${run.status}`}>{t.myRuns.status[run.status]}</span>
        <span>{t.myRuns.asked(t.date(run.createdAt))}</span>
        {run.amount !== null && <span>{t.myRuns.price(t.money(run.amount, "ARS"))}</span>}
      </p>
      <div className="my-run-actions">
        <CopyLink
          url={new URL(runPath(run.id), window.location.origin).href}
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
      </div>
    </li>
  );
}

/** "Mis preguntas" (step 33): the user's questions, each with its link, and deleting one. */
export function MyRunsPage() {
  const { ready, user, api, signIn } = useSession();
  const [runs, setRuns] = useState<MyRun[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<MyRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
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

  async function remove(run: MyRun) {
    setBusy(true);
    setDeleteError(null);
    try {
      await api.remove(run.id);
      setRuns((list) => list?.filter((r) => r.id !== run.id) ?? null);
      opener.current = null;
      setDeleting(null);
      setSaid(t.myRuns.removed);
      // The row and its button are gone: the focus goes back to the top of the list.
      title.current?.focus();
    } catch (e) {
      setDeleteError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

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
      ) : runs.length === 0 ? (
        <section className="empty">
          <p>{t.myRuns.empty}</p>
          <Link to="/" className="button button-primary">
            {t.myRuns.askFirst}
          </Link>
        </section>
      ) : (
        <>
          <p className="muted my-runs-lede">{t.myRuns.lede}</p>
          <ul className="my-run-list">
            {runs.map((run) => (
              <Row
                key={run.id}
                run={run}
                onDelete={(button) => {
                  opener.current = button;
                  setDeleteError(null);
                  setDeleting(run);
                }}
              />
            ))}
          </ul>
        </>
      )}
      {deleting && (
        <ConfirmDelete
          key={deleting.id}
          run={deleting}
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
