import { type Call, isPanel, type ModelId, type ProgressMessage } from "@chebot/protocol";

/** The browsers get more of what each seat says at most this often. */
export const PROGRESS_MS = 500;

/**
 * What the seats of the panel say during one step, for the browsers that follow the run: what
 * each seat's call said since the last message, at most every PROGRESS_MS while it goes, and null
 * as soon as it lands, or when the step ends. The page reads it at its own pace (reading.ts of the
 * app). Nothing of it is stored.
 */
export class SeatProgress {
  /** The call of each seat, what it said that the browsers did not get yet, and whether they got any. */
  private readonly seats = new Map<ModelId, { key: string; pending: string; sent: boolean }>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly send: (message: ProgressMessage) => void,
    private readonly ms = PROGRESS_MS,
  ) {}

  /** More of what the model of a call thinks or writes. */
  add(call: Call, text: string): void {
    if (!isPanel(call.seat)) return;
    const seat = this.seats.get(call.seat);
    if (seat?.key === call.key) seat.pending += text;
    else this.seats.set(call.seat, { key: call.key, pending: text, sent: false });
    this.timer ??= setTimeout(() => this.flush(), this.ms);
  }

  /** The call landed: its seat's paragraph goes away. */
  end(call: Call): void {
    if (!isPanel(call.seat) || this.seats.get(call.seat)?.key !== call.key) return;
    this.hide(call.seat);
  }

  /** The step ended: every paragraph goes away. */
  close(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    for (const seat of [...this.seats.keys()]) this.hide(seat);
  }

  private flush(): void {
    this.timer = null;
    for (const [seat, said] of this.seats) {
      if (!said.pending) continue;
      this.send({ type: "seat.progress", seat, call: said.key, text: said.pending });
      said.pending = "";
      said.sent = true;
    }
  }

  private hide(seat: ModelId): void {
    const said = this.seats.get(seat);
    this.seats.delete(seat);
    if (said?.sent) this.send({ type: "seat.progress", seat, call: said.key, text: null });
  }
}
