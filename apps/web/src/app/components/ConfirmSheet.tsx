import { type ReactNode, useEffect, useRef } from "react";
import { t } from "../i18n/index.ts";

/**
 * Asks before an action on a question (deleting it, asking it again): the question, what the
 * action does, and the two choices, the safe one focused first. Closing it is cancelling.
 */
export function ConfirmSheet({
  title,
  question,
  body,
  confirm,
  confirming,
  danger = false,
  busy,
  error,
  onConfirm,
  onClose,
}: {
  title: string;
  question: string;
  body: ReactNode;
  confirm: string;
  /** The text of the confirm button while the action waits for the API. */
  confirming: string;
  danger?: boolean;
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
          {title}
        </h2>
        <blockquote className="sheet-quote">{question}</blockquote>
        <p id="confirm-body">{body}</p>
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
            className={`button ${danger ? "button-danger" : "button-primary"}`}
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? confirming : confirm}
          </button>
        </div>
      </div>
    </dialog>
  );
}
