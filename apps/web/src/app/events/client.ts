import {
  emptyView,
  isProgressMessage,
  type LoggedEvent,
  type ModelId,
  type ProgressMessage,
  type RunView,
  replay,
} from "@chebot/protocol";

// The event client of a run page (step 27). It builds the view of the run with the same reducer
// the server uses (`replay` of @chebot/protocol), from the event log alone:
//
// - Catch-up renders at once: the first read (GET /events), and every read after a reconnect.
// - Live events (the WebSocket, or the polling fallback) play one by one: the events of a batch
//   (one stage of the run arrives as one batch) about 400 ms apart, and a whole batch in at most
//   4 s, for the feel of live editing.
// - A dropped socket reconnects with `after=<last seq>`; after a few failures in a row the client
//   reads GET /events every few seconds instead. Every event is applied once, in `seq` order.
// - A run that ended (completed, expired) is read over HTTP only.
// - Beside the events, the socket carries what each seat is thinking while its call goes
//   (`seat.progress`, never stored): kept apart from the view, and dropped with the socket.

/** What the client hears from a socket. */
export interface SocketHandlers {
  open(): void;
  message(data: unknown): void;
  /** The socket closed or could not open. */
  close(): void;
}

/** An open socket. */
export interface SocketLike {
  close(): void;
}

export interface Transport {
  /** GET /api/runs/:id/events?after=N */
  events(after: number): Promise<LoggedEvent[]>;
  /** Opens /api/runs/:id/ws?after=N */
  socket(after: number, handlers: SocketHandlers): SocketLike;
}

export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

/** The real clock, read at each call so that fake timers in tests replace it. */
export const systemClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export type Connection = "connecting" | "live" | "reconnecting" | "polling" | "closed";

export interface StreamState {
  view: RunView;
  /** The last seq applied to the view. */
  seq: number;
  connection: Connection;
  /** The seqs applied by the last update: the live ones the page may highlight. */
  fresh: number[];
  /** The paragraph each seat of the panel is writing now, while its call goes. */
  progress: Progress;
}

export type Progress = Readonly<Partial<Record<ModelId, string>>>;

export interface StreamOptions {
  transport: Transport;
  onChange: (state: StreamState) => void;
  clock?: Clock;
  /** The gap between two events of a batch. */
  gapMs?: number;
  /** The longest a batch plays. */
  batchCapMs?: number;
  /** Socket failures in a row before polling. */
  maxSocketFailures?: number;
  pollMs?: number;
  /** The wait before the first reconnect; it doubles up to `maxBackoffMs`. */
  backoffMs?: number;
  maxBackoffMs?: number;
}

/** A run that will append nothing more. A failed run may still be run again, so it stays open. */
export function ended(view: RunView): boolean {
  return view.status === "completed" || view.status === "expired";
}

export class RunStream {
  private view: RunView = emptyView();
  /** The last seq applied or waiting in the queue: nothing at or below it is taken again. */
  private received = 0;
  private applied = 0;
  private readonly queue: LoggedEvent[] = [];
  private playTimer: unknown = null;
  /** When the batch now playing started, and which batch it is; null when nothing plays. */
  private window: { batch: number; start: number } | null = null;
  private socket: SocketLike | null = null;
  private retryTimer: unknown = null;
  private failures = 0;
  private connection: Connection = "connecting";
  private progress: Progress = {};
  private stopped = false;
  private readonly clock: Clock;
  private readonly gapMs: number;
  private readonly batchCapMs: number;
  private readonly maxSocketFailures: number;
  private readonly pollMs: number;
  private readonly backoffMs: number;
  private readonly maxBackoffMs: number;

  constructor(private readonly options: StreamOptions) {
    this.clock = options.clock ?? systemClock;
    this.gapMs = options.gapMs ?? 400;
    this.batchCapMs = options.batchCapMs ?? 4_000;
    this.maxSocketFailures = options.maxSocketFailures ?? 3;
    this.pollMs = options.pollMs ?? 3_000;
    this.backoffMs = options.backoffMs ?? 1_000;
    this.maxBackoffMs = options.maxBackoffMs ?? 8_000;
  }

  /** Reads the log so far (rendered at once), then follows the run unless it ended. */
  async start(): Promise<void> {
    await this.catchUp();
    if (this.stopped) return;
    if (ended(this.view)) this.setConnection("closed");
    else this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.clearTimer("retryTimer");
    this.clearTimer("playTimer");
    const socket = this.socket;
    this.socket = null;
    this.progress = {};
    socket?.close();
  }

  /** Reads the events missed since the last one received and applies them at once. */
  private async catchUp(): Promise<void> {
    const events = await this.options.transport.events(this.received);
    if (this.stopped) return;
    this.applyNow(events);
  }

  private connect(): void {
    if (this.stopped) return;
    this.setConnection(this.failures > 0 ? "reconnecting" : "connecting");
    let opened = false;
    let socket: SocketLike | null = null;
    const current = () => socket !== null && this.socket === socket;
    try {
      socket = this.options.transport.socket(this.received, {
        open: () => {
          if (!current()) return;
          opened = true;
          this.failures = 0;
          this.setConnection("live");
        },
        message: (data) => {
          if (!current() || typeof data !== "string") return;
          let message: unknown;
          try {
            message = JSON.parse(data);
          } catch {
            return; // not JSON
          }
          if (isProgressMessage(message)) this.think(message);
          else this.receive([message as LoggedEvent]);
        },
        close: () => {
          if (!current()) return;
          this.socket = null;
          this.forget();
          if (this.stopped) return;
          if (ended(this.view)) return this.setConnection("closed");
          if (!opened) this.socketFailed();
          else this.reconnectLater();
        },
      });
    } catch {
      this.socketFailed();
      return;
    }
    this.socket = socket;
  }

  private socketFailed(): void {
    this.failures++;
    if (this.failures >= this.maxSocketFailures) this.poll();
    else this.reconnectLater();
  }

  /** After a drop: wait, read what was missed (at once), and open a socket after it. */
  private reconnectLater(): void {
    this.setConnection("reconnecting");
    const wait = Math.min(this.backoffMs * 2 ** Math.max(0, this.failures - 1), this.maxBackoffMs);
    this.retryTimer = this.clock.setTimeout(() => {
      this.retryTimer = null;
      this.catchUp()
        .then(() => {
          if (this.stopped) return;
          if (ended(this.view)) this.setConnection("closed");
          else this.connect();
        })
        .catch(() => this.socketFailed());
    }, wait);
  }

  /** The fallback without a socket: GET /events every `pollMs`, played as live events. */
  private poll(): void {
    if (this.stopped) return;
    this.setConnection("polling");
    this.retryTimer = this.clock.setTimeout(async () => {
      this.retryTimer = null;
      try {
        this.receive(await this.options.transport.events(this.received));
      } catch {
        // the next poll tries again
      }
      if (this.stopped) return;
      if (ended(this.view) && this.queue.length === 0) this.setConnection("closed");
      else this.poll();
    }, this.pollMs);
  }

  /** New events, in seq order, not seen before. */
  private fresh(events: readonly LoggedEvent[]): LoggedEvent[] {
    const out: LoggedEvent[] = [];
    let last = this.received;
    for (const event of [...events].sort((a, b) => a.seq - b.seq)) {
      if (event.seq <= last) continue;
      out.push(event);
      last = event.seq;
    }
    return out;
  }

  /** Catch-up: the queue first (it is older), then these events, all in one update. */
  private applyNow(events: readonly LoggedEvent[]): void {
    const fresh = this.fresh(events);
    const pending = this.queue.splice(0);
    this.clearTimer("playTimer");
    this.window = null;
    const all = [...pending, ...fresh];
    if (all.length === 0) {
      this.emit([]);
      return;
    }
    this.received = Math.max(this.received, all.at(-1)?.seq ?? 0);
    this.apply(all, []);
  }

  /** Live events: queued, and played one by one. */
  private receive(events: readonly LoggedEvent[]): void {
    const fresh = this.fresh(events);
    if (fresh.length === 0) return;
    this.received = fresh.at(-1)?.seq ?? this.received;
    this.queue.push(...fresh);
    if (this.playTimer === null) this.play();
  }

  /** Applies the head of the queue and schedules the next one (or the end of the gap). */
  private play(): void {
    this.playTimer = null;
    const head = this.queue.shift();
    if (!head) {
      this.window = null;
      return;
    }
    const now = this.clock.now();
    if (this.window?.batch !== head.batch) this.window = { batch: head.batch, start: now };
    this.apply([head], [head.seq]);
    // With nothing queued, the next event to arrive still waits one gap after this one.
    const next = this.queue[0];
    let wait = this.gapMs;
    if (next && next.batch === this.window.batch) {
      const left = this.queue.filter((e) => e.batch === next.batch).length;
      const budget = Math.max(0, this.batchCapMs - (now - this.window.start));
      wait = Math.min(this.gapMs, budget / left);
    }
    this.playTimer = this.clock.setTimeout(() => this.play(), wait);
  }

  private apply(events: LoggedEvent[], fresh: number[]): void {
    this.view = replay(events, this.view);
    this.applied = events.at(-1)?.seq ?? this.applied;
    if (this.view.status !== "running") this.progress = {};
    this.emit(fresh);
  }

  /** What a seat is thinking now; null: its call landed. Only while the run goes. */
  private think(message: ProgressMessage): void {
    const { [message.seat]: _, ...others } = this.progress;
    if (message.text === null && !(message.seat in this.progress)) return;
    this.progress =
      message.text !== null && this.view.status === "running"
        ? { ...others, [message.seat]: message.text }
        : others;
    this.emit([]);
  }

  /** The socket is gone: what it said of the seats is stale. */
  private forget(): void {
    if (Object.keys(this.progress).length === 0) return;
    this.progress = {};
    this.emit([]);
  }

  private setConnection(connection: Connection): void {
    if (this.connection === connection) return;
    this.connection = connection;
    this.emit([]);
  }

  private emit(fresh: number[]): void {
    this.options.onChange({
      view: this.view,
      seq: this.applied,
      connection: this.connection,
      fresh,
      progress: this.progress,
    });
  }

  private clearTimer(name: "retryTimer" | "playTimer"): void {
    if (this[name] !== null) this.clock.clearTimeout(this[name]);
    this[name] = null;
  }
}
