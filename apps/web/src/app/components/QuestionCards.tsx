import { useEffect, useRef, useState } from "react";
import { imagePath, type PublicRun } from "../api.ts";
import { useSession } from "../auth/context.tsx";
import { isAdmin } from "../auth/types.ts";
import { t } from "../i18n/index.ts";
import { Link, navigate } from "../router/index.tsx";
import { runPath } from "../routes.tsx";
import { errorText } from "../view/errors.ts";
import { ConfirmSheet } from "./ConfirmSheet.tsx";
import { ImageIcon, RefreshIcon } from "./Icons.tsx";
import { useRedraw } from "./useRedraw.ts";

/**
 * The buttons over the picture of a card: its owner asks the question again once it ended (the new
 * run takes its place, as on its page); its owner or an admin draws its picture again.
 */
function CardActions({
  run,
  admin,
  onDrawn,
}: {
  run: PublicRun;
  admin: boolean;
  onDrawn: (image: string) => void;
}) {
  const { api } = useSession();
  const [asking, setAsking] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const drawing = useRedraw(run.id, run.image !== null, onDrawn);
  const refreshable = run.mine && (run.status === "completed" || run.status === "failed");
  // Every card is a question that was asked: its owner may draw its picture.
  const drawable = run.mine || admin;
  if (!refreshable && !drawable) return null;

  async function refresh() {
    setRefreshing(true);
    setRefreshError(null);
    try {
      const quote = await api.ask(run.question, run.id);
      navigate(runPath(quote.runId));
    } catch (e) {
      setRefreshError(errorText(e));
      setRefreshing(false);
    }
  }

  function close() {
    setAsking(false);
    setRefreshError(null);
    opener.current?.focus();
  }

  return (
    <>
      <div className="card-actions" role="toolbar" aria-label={t.run.actions}>
        {refreshable && (
          <button
            type="button"
            className="icon-button"
            aria-label={t.run.refresh}
            title={t.run.refresh}
            aria-describedby={`card-${run.id}`}
            aria-haspopup="dialog"
            onClick={(e) => {
              opener.current = e.currentTarget;
              setRefreshError(null);
              setAsking(true);
            }}
          >
            <RefreshIcon />
          </button>
        )}
        {drawable && (
          <button
            type="button"
            className="icon-button"
            aria-label={drawing.label}
            title={drawing.label}
            aria-describedby={`card-${run.id}`}
            aria-busy={drawing.busy}
            disabled={drawing.busy}
            onClick={drawing.redraw}
          >
            <ImageIcon />
          </button>
        )}
      </div>
      <p className="sr-only" role="status">
        {drawing.said}
      </p>
      {drawing.error && (
        <p className="error card-error" role="alert">
          {drawing.error}
        </p>
      )}
      {asking && (
        <ConfirmSheet
          title={t.run.refreshTitle}
          question={run.question}
          body={t.run.refreshBody(admin)}
          confirm={t.run.refreshConfirm}
          confirming={t.run.refreshing}
          busy={refreshing}
          error={refreshError}
          onConfirm={refresh}
          onClose={close}
        />
      )}
    </>
  );
}

/** A question asked: its picture, its text and when it was asked; its status while it is not done. */
function Card({
  run,
  admin,
  onDrawn,
}: {
  run: PublicRun;
  admin: boolean;
  onDrawn: (image: string) => void;
}) {
  return (
    <li className="card" data-testid="question-card">
      <Link to={runPath(run.id, run.link)} className="card-link">
        <span className="card-picture">
          {run.image ? (
            <img
              src={imagePath(run.id, run.image)}
              alt=""
              loading="lazy"
              width={512}
              height={512}
            />
          ) : (
            <span className="card-placeholder" aria-hidden="true" />
          )}
          {run.status !== "completed" && (
            <span className={`card-stamp status-${run.status}`}>
              {run.status === "running" && <span className="pulse" aria-hidden="true" />}
              {t.myRuns.status[run.status]}
            </span>
          )}
        </span>
        <span className="card-question" id={`card-${run.id}`}>
          {run.question}
        </span>
      </Link>
      <p className="card-meta">
        <time dateTime={run.createdAt}>{t.home.asked(t.day(run.createdAt))}</time>
      </p>
      <CardActions run={run} admin={admin} onDrawn={onDrawn} />
    </li>
  );
}

/**
 * The questions that were asked, as cards with their pictures, newest first; every question is
 * public. A page at a time: "Ver más" reads the next one.
 */
export function QuestionCards() {
  const { api, user } = useSession();
  const [runs, setRuns] = useState<PublicRun[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const admin = isAdmin(user);

  useEffect(() => {
    let live = true;
    api
      .runs()
      .then((page) => {
        if (!live) return;
        setRuns(page.runs);
        setNext(page.next);
      })
      .catch((e: unknown) => live && setError(errorText(e)));
    return () => {
      live = false;
    };
  }, [api]);

  async function more() {
    if (!next) return;
    setLoading(true);
    setError(null);
    try {
      const page = await api.runs(next);
      // A run may move from one page to the next while they are read: each card once.
      setRuns((have) => {
        const seen = new Set(have?.map((r) => r.id));
        return [...(have ?? []), ...page.runs.filter((r) => !seen.has(r.id))];
      });
      setNext(page.next);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }

  const drawn = (id: string) => (image: string) =>
    setRuns((have) => have?.map((r) => (r.id === id ? { ...r, image } : r)) ?? null);

  return (
    <section className="feed" aria-labelledby="feed-title" aria-busy={runs === null || loading}>
      <h1 id="feed-title" className="feed-title">
        {t.home.title}
      </h1>
      <p className="muted feed-lede">{t.home.lede}</p>
      {runs === null ? (
        !error && <p className="muted">{t.common.loading}</p>
      ) : runs.length === 0 ? (
        <p className="muted">{t.home.empty}</p>
      ) : (
        <ul className="cards">
          {runs.map((run) => (
            <Card key={run.id} run={run} admin={admin} onDrawn={drawn(run.id)} />
          ))}
        </ul>
      )}
      {error && (
        <p className="error" role="alert">
          {runs === null ? t.home.failed : error}
        </p>
      )}
      {next && (
        <div className="feed-more">
          <button type="button" className="button" disabled={loading} onClick={more}>
            {loading ? t.home.loadingMore : t.home.more}
          </button>
        </div>
      )}
    </section>
  );
}
