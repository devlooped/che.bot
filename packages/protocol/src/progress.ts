import { isPanel, type ModelId } from "./model.ts";

// What a seat is thinking while it answers: a message of the socket of a run that is not an event.
// It is never stored, and a page that opens late or reconnects only sees the next one: it shows
// while the call goes and goes away when it lands.

/** The paragraph a seat of the panel is writing now; `text` null: its call landed, hide it. */
export interface ProgressMessage {
  type: "seat.progress";
  seat: ModelId;
  text: string | null;
}

export function isProgressMessage(value: unknown): value is ProgressMessage {
  const message = value as Partial<ProgressMessage> | null;
  return (
    typeof message === "object" &&
    message !== null &&
    message.type === "seat.progress" &&
    typeof message.seat === "string" &&
    isPanel(message.seat) &&
    (message.text === null || typeof message.text === "string")
  );
}

/** The longest paragraph of progress a page shows. */
export const PROGRESS_CHARS = 280;

/**
 * The paragraph a model is writing: the last paragraph of what it thought and wrote so far, as
 * plain text (no Markdown marks, one space between words), cut to its last `max` characters from
 * the start of a word, after an ellipsis. Empty when nothing was said.
 */
export function progressTail(text: string, max = PROGRESS_CHARS): string {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((paragraph) =>
      paragraph
        .replace(/[*_`]+|^#+\s*/gm, "")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean);
  const last = paragraphs.at(-1) ?? "";
  if (last.length <= max) return last;
  const from = last.length - max;
  const word = last[from - 1] === " " ? from : last.indexOf(" ", from) + 1;
  return `…${last.slice(word > 0 ? word : from)}`;
}
