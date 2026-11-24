import {
  type Call,
  isPanel,
  type ModelId,
  type ProgressMessage,
  progressTail,
} from "@chebot/protocol";

/** The browsers get the paragraph of each seat at most this often. */
export const PROGRESS_MS = 500;
/** What is kept of what a call said: enough for its last paragraph (progressTail). */
const KEPT_CHARS = 4_000;

/**
 * What the seats of the panel say during one step, for the browsers that follow the run: each
 * seat's last paragraph (progressTail) at most every PROGRESS_MS while its call goes, and null as
 * soon as it lands, or when the step ends. Nothing of it is stored.
 */
export class SeatProgress {
  /** What the call of each seat said so far, and what the browsers last got. */
  private readonly seats = new Map<ModelId, { key: string; text: string; sent: string }>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly send: (message: ProgressMessage) => void,
    private readonly ms = PROGRESS_MS,
  ) {}

  /** More of what the model of a call thinks or writes. */
  add(call: Call, text: string): void {
    if (!isPanel(call.seat)) return;
    const seat = this.seats.get(call.seat);
    const said = (seat?.key === call.key ? seat.text : "") + text;
    this.seats.set(call.seat, {
      key: call.key,
      text: said.length > KEPT_CHARS * 2 ? said.slice(-KEPT_CHARS) : said,
      sent: seat?.sent ?? "",
    });
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
      const text = progressTail(said.text);
      if (!text || text === said.sent) continue;
      said.sent = text;
      this.send({ type: "seat.progress", seat, text });
    }
  }

  private hide(seat: ModelId): void {
    const said = this.seats.get(seat);
    this.seats.delete(seat);
    if (said?.sent) this.send({ type: "seat.progress", seat, text: null });
  }
}
