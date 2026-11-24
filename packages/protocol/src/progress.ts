import { isPanel, type ModelId } from "./model.ts";

// What a seat is thinking while it answers: a message of the socket of a run that is not an event.
// It is never stored, and a page that opens late or reconnects only gets what comes after: it shows
// while the call goes and goes away when it lands.

/**
 * More of what the model in a seat of the panel thinks and writes during its call `call` (the
 * key of the call), as the provider streamed it: paragraphs apart by a blank line. `text` null:
 * the call landed, hide it.
 */
export interface ProgressMessage {
  type: "seat.progress";
  seat: ModelId;
  call: string;
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
    typeof message.call === "string" &&
    (message.text === null || typeof message.text === "string")
  );
}
