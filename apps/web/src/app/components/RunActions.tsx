import { useRef, useState } from "react";
import { useSession } from "../auth/context.tsx";
import { t } from "../i18n/index.ts";
import { navigate } from "../router/index.tsx";
import { runPath } from "../routes.tsx";
import { errorText } from "../view/errors.ts";
import { ConfirmSheet } from "./ConfirmSheet.tsx";
import { Sheet } from "./Discussion.tsx";
import { HelpIcon, RefreshIcon, ShareIcon, TrashIcon } from "./Icons.tsx";
import { ShareLink } from "./ShareLink.tsx";

/** How the page works: the buttons of the bar, the seats, the margin marks, the sections. */
function HelpSheet({ onClose }: { onClose: () => void }) {
  const items = [
    { icon: <ShareIcon />, text: t.help.share },
    { icon: <RefreshIcon />, text: t.help.refresh },
    { icon: <TrashIcon />, text: t.help.remove },
    { icon: null, text: t.help.seats },
    { icon: null, text: t.help.marks },
    { icon: null, text: t.help.sections },
  ];
  return (
    <Sheet title={t.help.title} className="help-sheet" onClose={onClose}>
      <ul className="help-list">
        {items.map((item) => (
          <li key={item.text} className="help-item">
            <span className="help-icon">{item.icon}</span>
            <span>{item.text}</span>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

type Open = "help" | "refresh" | "remove" | null;

/**
 * The bar under the question: share it, and the help of the page, for everyone; ask it again and
 * delete it, for its owner, who alone sees a deleted question, and restores it here.
 */
export function RunActions({
  runId,
  question,
  url,
  mine,
  deleted,
  answered,
  free,
  onChange,
}: {
  runId: string;
  question: string;
  url: string;
  mine: boolean;
  deleted: boolean;
  /** The run ended with an answer or failed: asking it again makes sense. */
  answered: boolean;
  /** The owner runs free (an admin): asking again costs nothing. */
  free: boolean;
  /** The summary changed (deleted, restored): read it again. */
  onChange: () => void;
}) {
  const { api } = useSession();
  const [open, setOpen] = useState<Open>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);

  function show(which: Open, button: HTMLButtonElement) {
    opener.current = button;
    setError(null);
    setOpen(which);
  }

  function close() {
    setOpen(null);
    opener.current?.focus();
  }

  async function act(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  /** The same question as a new run, with the panel of today, in place of this one. */
  const refresh = () =>
    act(async () => {
      const quote = await api.ask(question, runId);
      navigate(runPath(quote.runId));
    });

  const remove = () =>
    act(async () => {
      await api.remove(runId);
      setOpen(null);
      onChange();
    });

  const restore = () =>
    act(async () => {
      await api.restore(runId);
      onChange();
    });

  return (
    <>
      <div className="run-actions" role="toolbar" aria-label={t.run.actions}>
        <ShareLink url={url} />
        {mine && answered && !deleted && (
          <button
            type="button"
            className="icon-button"
            aria-label={t.run.refresh}
            title={t.run.refresh}
            onClick={(e) => show("refresh", e.currentTarget)}
          >
            <RefreshIcon />
          </button>
        )}
        {mine && !deleted && (
          <button
            type="button"
            className="icon-button"
            aria-label={t.run.remove}
            title={t.run.remove}
            onClick={(e) => show("remove", e.currentTarget)}
          >
            <TrashIcon />
          </button>
        )}
        <button
          type="button"
          className="icon-button"
          aria-label={t.help.open}
          title={t.help.open}
          aria-haspopup="dialog"
          onClick={(e) => show("help", e.currentTarget)}
        >
          <HelpIcon />
        </button>
      </div>
      {deleted && (
        <div className="run-deleted" data-testid="run-deleted">
          <span className="run-deleted-badge">{t.run.deleted}</span>
          <span className="fine">{t.run.deletedNote}</span>
          <button type="button" className="button button-text" disabled={busy} onClick={restore}>
            {busy ? t.run.restoring : t.run.restore}
          </button>
          {error && open === null && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
      {open === "help" && <HelpSheet onClose={close} />}
      {open === "refresh" && (
        <ConfirmSheet
          title={t.run.refreshTitle}
          question={question}
          body={t.run.refreshBody(free)}
          confirm={t.run.refreshConfirm}
          confirming={t.run.refreshing}
          busy={busy}
          error={error}
          onConfirm={refresh}
          onClose={close}
        />
      )}
      {open === "remove" && (
        <ConfirmSheet
          title={t.myRuns.confirmTitle}
          question={question}
          body={t.myRuns.confirmBody}
          confirm={t.myRuns.confirm}
          confirming={t.myRuns.removing}
          danger
          busy={busy}
          error={error}
          onConfirm={remove}
          onClose={close}
        />
      )}
    </>
  );
}
