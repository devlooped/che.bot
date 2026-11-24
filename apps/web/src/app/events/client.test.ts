import type { LoggedEvent, RunEvent } from "@chebot/protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RunStream, type SocketHandlers, type SocketLike, type StreamState } from "./client.ts";

/** A log of `n` moments: batch `batchOf(i)`, seq from `from`. */
function moments(n: number, from = 1, batchOf: (i: number) => number = () => 1): LoggedEvent[] {
  return Array.from({ length: n }, (_, i) => ({
    key: `moment:${from + i}`,
    batch: batchOf(i),
    type: "moment",
    text: `m${from + i}`,
    origin: "template",
    seq: from + i,
    at: 0,
  })) satisfies (RunEvent & { seq: number; at: number })[];
}

const completed = (seq: number): LoggedEvent => ({
  key: "run.completed",
  batch: 9,
  type: "run.completed",
  version: 1,
  flags: {
    fewDrafts: false,
    mergeFallback: null,
    budgetReached: false,
    deadlineReached: false,
    quorumLost: false,
  },
  spentUsd: 0.2,
  seq,
  at: 0,
});

class FakeSocket implements SocketLike {
  closed = false;
  constructor(
    readonly after: number,
    private readonly handlers: SocketHandlers,
  ) {}
  open() {
    this.handlers.open();
  }
  send(events: LoggedEvent[]) {
    for (const e of events) this.handlers.message(JSON.stringify(e));
  }
  /** A message that is not an event. */
  say(data: string) {
    this.handlers.message(data);
  }
  drop() {
    this.handlers.close();
  }
  close() {
    this.closed = true;
  }
}

/** A server with a log; GET /events and sockets read it. */
function server(log: LoggedEvent[] = []) {
  const sockets: FakeSocket[] = [];
  const reads: number[] = [];
  const transport = {
    events: vi.fn(async (after: number) => {
      reads.push(after);
      return log.filter((e) => e.seq > after);
    }),
    socket: vi.fn((after: number, handlers: SocketHandlers) => {
      const socket = new FakeSocket(after, handlers);
      sockets.push(socket);
      return socket;
    }),
  };
  return { log, sockets, reads, transport };
}

function stream(transport: ReturnType<typeof server>["transport"]) {
  const states: StreamState[] = [];
  const s = new RunStream({ transport, onChange: (state) => states.push(state) });
  const texts = () => states.at(-1)?.view.moments.map((m) => m.text) ?? [];
  const last = () => states.at(-1);
  return { s, states, texts, last };
}

/** Lets pending promises settle. */
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("the event client", () => {
  it("renders the log so far at once, then opens the socket after its last seq", async () => {
    const srv = server(moments(20));
    const { s, texts, last } = stream(srv.transport);
    await s.start();
    expect(texts()).toHaveLength(20);
    expect(last()?.seq).toBe(20);
    expect(srv.reads).toEqual([0]);
    expect(srv.sockets.map((x) => x.after)).toEqual([20]);
  });

  it("plays live events of a batch 400 ms apart", async () => {
    const srv = server();
    const { s, texts } = stream(srv.transport);
    await s.start();
    const socket = srv.sockets[0];
    socket?.open();
    socket?.send(moments(3));
    expect(texts()).toEqual(["m1"]);
    vi.advanceTimersByTime(399);
    expect(texts()).toEqual(["m1"]);
    vi.advanceTimersByTime(1);
    expect(texts()).toEqual(["m1", "m2"]);
    vi.advanceTimersByTime(400);
    expect(texts()).toEqual(["m1", "m2", "m3"]);
  });

  it("plays a long batch in at most 4 seconds", async () => {
    const srv = server();
    const { s, texts } = stream(srv.transport);
    await s.start();
    srv.sockets[0]?.open();
    srv.sockets[0]?.send(moments(31));
    vi.advanceTimersByTime(3_500);
    expect(texts().length).toBeLessThan(31);
    vi.advanceTimersByTime(500);
    expect(texts()).toHaveLength(31);
  });

  it("starts the next batch one gap after the last event of the previous one", async () => {
    const srv = server();
    const { s, texts } = stream(srv.transport);
    await s.start();
    srv.sockets[0]?.open();
    srv.sockets[0]?.send(moments(4, 1, (i) => (i < 2 ? 1 : 2)));
    expect(texts()).toEqual(["m1"]);
    vi.advanceTimersByTime(400);
    expect(texts()).toEqual(["m1", "m2"]);
    vi.advanceTimersByTime(400);
    expect(texts()).toEqual(["m1", "m2", "m3"]);
    vi.advanceTimersByTime(400);
    expect(texts()).toHaveLength(4);
  });

  it("applies every event once and in seq order", async () => {
    const srv = server();
    const { s, texts } = stream(srv.transport);
    await s.start();
    srv.sockets[0]?.open();
    const [a, b, c] = moments(3);
    if (!a || !b || !c) throw new Error("no events");
    srv.sockets[0]?.send([a, a, b]);
    srv.sockets[0]?.send([b, c, a]);
    vi.advanceTimersByTime(2_000);
    expect(texts()).toEqual(["m1", "m2", "m3"]);
  });

  it("after a drop, reads what it missed at once and reconnects after the last seq", async () => {
    const srv = server(moments(5));
    const { s, texts } = stream(srv.transport);
    await s.start();
    const first = srv.sockets[0];
    first?.open();
    // Events 6 to 8 land on the server while the socket is down.
    srv.log.push(...moments(3, 6, () => 2));
    first?.drop();
    expect(srv.sockets).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1_000);
    await flush();
    expect(srv.reads).toEqual([0, 5]);
    expect(texts()).toEqual(["m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8"]);
    expect(srv.sockets.map((x) => x.after)).toEqual([5, 8]);
    // A replay of the server's older events on the new socket changes nothing.
    srv.sockets[1]?.open();
    srv.sockets[1]?.send(moments(8));
    vi.advanceTimersByTime(5_000);
    expect(texts()).toHaveLength(8);
  });

  it("renders events still waiting to play at once when it catches up after a drop", async () => {
    const srv = server();
    const { s, texts } = stream(srv.transport);
    await s.start();
    srv.sockets[0]?.open();
    srv.sockets[0]?.send(moments(6));
    expect(texts()).toEqual(["m1"]);
    srv.log.push(...moments(8));
    srv.sockets[0]?.drop();
    await vi.advanceTimersByTimeAsync(1_000);
    await flush();
    expect(texts()).toEqual(["m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8"]);
    expect(srv.reads).toEqual([0, 6]);
  });

  it("falls back to reading GET /events when the socket keeps failing", async () => {
    const srv = server(moments(2));
    const { s, texts, last } = stream(srv.transport);
    await s.start();
    for (let i = 0; i < 3; i++) {
      srv.sockets.at(-1)?.drop(); // never opened
      await vi.advanceTimersByTimeAsync(8_000);
      await flush();
    }
    expect(last()?.connection).toBe("polling");
    const sockets = srv.sockets.length;
    srv.log.push(...moments(2, 3));
    await vi.advanceTimersByTimeAsync(3_000);
    await flush();
    vi.advanceTimersByTime(400);
    expect(texts()).toEqual(["m1", "m2", "m3", "m4"]);
    expect(srv.sockets).toHaveLength(sockets);
    srv.log.push(completed(5));
    await vi.advanceTimersByTimeAsync(3_000);
    await flush();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(last()?.view.status).toBe("completed");
    expect(last()?.connection).toBe("closed");
  });

  it("reads an ended run over HTTP only", async () => {
    const srv = server([...moments(3), completed(4)]);
    const { s, last } = stream(srv.transport);
    await s.start();
    expect(last()?.view.status).toBe("completed");
    expect(last()?.connection).toBe("closed");
    expect(srv.sockets).toHaveLength(0);
  });

  it("stops playing and closes its socket when stopped", async () => {
    const srv = server();
    const { s, texts } = stream(srv.transport);
    await s.start();
    srv.sockets[0]?.open();
    srv.sockets[0]?.send(moments(3));
    s.stop();
    vi.advanceTimersByTime(5_000);
    expect(texts()).toEqual(["m1"]);
    expect(srv.sockets[0]?.closed).toBe(true);
  });
});

describe("what the seats are thinking", () => {
  const started: LoggedEvent = {
    key: "run.started",
    batch: 1,
    type: "run.started",
    runId: "r1",
    question: "¿Cuánta agua?",
    mode: "thorough",
    models: {},
    budgetUsd: 2,
    deadlineAt: 0,
    seq: 1,
    at: 0,
  };
  const said = (seat: string, text: string | null, call = `draft:0:${seat}`) =>
    JSON.stringify({ type: "seat.progress", seat, call, text });

  /** A run that goes, followed over an open socket. */
  async function running() {
    const srv = server([started]);
    const st = stream(srv.transport);
    await st.s.start();
    const socket = srv.sockets[0];
    if (!socket) throw new Error("no socket");
    socket.open();
    return { ...st, srv, socket, message: (data: string) => socket.say(data) };
  }

  it("keeps what each seat said in its call apart from the events, and drops it when the call lands", async () => {
    const { message, last } = await running();
    message(said("claude", "Separo la cifra "));
    message(said("grok", "Busco la cifra."));
    message(said("claude", "de la afirmación."));
    expect(last()?.progress).toEqual({
      claude: { call: "draft:0:claude", text: "Separo la cifra de la afirmación." },
      grok: { call: "draft:0:grok", text: "Busco la cifra." },
    });
    expect(last()?.seq).toBe(1);
    message(said("claude", null));
    expect(last()?.progress).toEqual({ grok: { call: "draft:0:grok", text: "Busco la cifra." } });
    // the next call of a seat starts anew
    message(said("grok", "Leo el texto.", "round:1:grok"));
    expect(last()?.progress).toEqual({ grok: { call: "round:1:grok", text: "Leo el texto." } });
  });

  it("ignores a seat outside the panel and a run that does not go", async () => {
    const srv = server();
    const { s, last } = stream(srv.transport);
    await s.start();
    srv.sockets[0]?.open();
    srv.sockets[0]?.say(said("grok", "Antes de empezar."));
    expect(last()?.progress).toEqual({});
    const { message, last: lastRunning } = await running();
    message(said("utility", "Junto las respuestas."));
    expect(lastRunning()?.progress).toEqual({});
  });

  it("forgets every paragraph when the socket drops, and when the run ends", async () => {
    const dropped = await running();
    dropped.message(said("openai", "Comparo las fuentes."));
    dropped.socket.drop();
    expect(dropped.last()?.progress).toEqual({});

    const ending = await running();
    ending.message(said("gemini", "Reviso las propuestas."));
    ending.socket.send([completed(2)]);
    expect(ending.last()?.progress).toEqual({});
  });
});
