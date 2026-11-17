import {
  appendEvents,
  beginStep,
  type Call,
  type CallResult,
  type CallSeat,
  type CallsStep,
  type CreateRunInput,
  createRun,
  type LoggedEvent,
  MODELS,
  type ModelSnapshot,
  nextStep,
  type OutputOf,
  type RenderRequest,
  type RunState,
  reduce,
  type Seat,
} from "@chebot/protocol";
import { type ModelProvider, type ModelRef, ProviderError, type Usage } from "@chebot/providers";

// The driver: the orchestrator (nextStep, reduce) decides; the driver makes the calls of a step in
// parallel, keeps every result in a ledger as it lands, and appends the events. `runCalls` is the
// part every runtime shares: the CLI loops over it with `drive`, the Durable Object runs one step
// per alarm.

/**
 * The render gate of chart runs: Vega-Lite compiled and rendered to SVG (in Vega's interpreter
 * mode, which the Workers runtime needs). The driver hands it the calls of kind "render" instead of
 * a model, with the same ledger, timeout and events, so the reducer stays pure. A spec that does
 * not compile or render is a failed result, not an error.
 */
export interface ChartRenderer {
  render(req: RenderRequest & { key: string; signal: AbortSignal }): Promise<OutputOf<"render">>;
}

/** The model of the ledger entries of render calls. */
export const RENDERER_MODEL: ModelRef = { id: "renderer", effort: null };

/** A finished call, as the ledger keeps it. */
export interface LedgerEntry {
  result: CallResult;
  seat: CallSeat;
  model: ModelRef;
  /** The message of the provider error, for an abstention. */
  error: string | null;
  /** The tokens an abstained call reported before it failed (an ok result carries its own). */
  usage: Usage | null;
}

/**
 * Where the results of calls are kept, by call key. A call whose key has a result in the ledger is
 * never made again: a rerun or a resumed run reads the result instead. In memory by default; the
 * evaluation keeps it on disk and the Durable Object in SQLite. One ledger per run.
 */
export interface CallLedger {
  /** The result of a finished call. */
  get(key: string): Promise<LedgerEntry | undefined>;
  /**
   * Records that the call is about to be made, before the request, and returns how many earlier
   * attempts of it started and never got a result: calls cut short by a restart. A ledger without
   * it (a file, which only a finished call reaches) has no interrupted attempts.
   */
  begin?(key: string, at: number): Promise<number>;
  /** Stores the result of a call as soon as it lands, each call on its own. */
  put(key: string, entry: LedgerEntry): Promise<void>;
}

/** How many times a call cut short by a restart is made again. */
export const INTERRUPTED_RETRIES = 1;

export function memoryLedger(): CallLedger & {
  entries: Map<string, LedgerEntry>;
  starts: Map<string, number>;
} {
  const entries = new Map<string, LedgerEntry>();
  const starts = new Map<string, number>();
  return {
    entries,
    starts,
    get: async (key) => entries.get(key),
    begin: async (key) => {
      const earlier = starts.get(key) ?? 0;
      starts.set(key, earlier + 1);
      return earlier;
    },
    put: async (key, entry) => {
      entries.set(key, entry);
    },
  };
}

/** One line of the call log. */
export interface CallLogEntry {
  key: string;
  seat: CallSeat;
  kind: Call["kind"];
  stage: string;
  model: string;
  status: "ok" | "abstained";
  reason: string | null;
  error: string | null;
  costUsd: number;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
}

export interface CallOptions {
  provider: ModelProvider;
  /** Executes the render calls of chart runs; without it, a render call abstains. */
  renderer?: ChartRenderer;
  ledger: CallLedger;
  /** The clock: the latency of an abstention. */
  now: () => number;
  /** Each call as it is made (or read from the ledger) and as it lands. */
  onCall?: (call: Call, phase: "start" | "end", entry?: LedgerEntry & { cached: boolean }) => void;
}

export interface DriveOptions extends Omit<CallOptions, "ledger" | "now"> {
  ledger?: CallLedger;
  /** The clock: the run's deadline and the time of every event. */
  now?: () => number;
  /** Each event as it is appended to the log. */
  onEvent?: (event: LoggedEvent) => void;
  /**
   * Each step once its calls have landed, before it is reduced: `state` is the state the step was
   * computed from. The evaluation advances its clock here and keeps the state before the editor.
   */
  onStep?: (state: RunState, step: CallsStep, entries: readonly LedgerEntry[]) => void;
  /** Stops the drive between two steps; the state returned can be driven again later. */
  signal?: AbortSignal;
}

export interface Driven {
  state: RunState;
  log: LoggedEvent[];
  /** Every call of the run, once, in the order the run made them. */
  calls: CallLogEntry[];
  /** False when the signal stopped the drive before the run ended. */
  done: boolean;
}

/** The role of the snapshot that sits in a seat. */
export function roleOf(seat: Seat): string {
  return seat === "utility" ? "utility" : `panel.${seat}`;
}

export function modelFor(models: ModelSnapshot, seat: CallSeat): ModelRef {
  if (seat === "renderer") return RENDERER_MODEL;
  const model = models[roleOf(seat)];
  if (!model) throw new Error(`The model snapshot of the run has no ${roleOf(seat)}.`);
  return model;
}

/** Throws unless the snapshot has a model for every seat. */
export function checkSnapshot(models: ModelSnapshot): void {
  for (const seat of [...MODELS, "utility" as const]) modelFor(models, seat);
}

/** A new run (its `run.started` event is in the log) to pass to `drive`. */
export function startRun(
  input: CreateRunInput,
  now: number,
): { state: RunState; log: LoggedEvent[] } {
  const created = createRun(input, now);
  return { state: created.state, log: appendEvents([], created.events, now).log };
}

/**
 * Drives a run to its end (or until `signal` aborts between two steps). `run` is a new run from
 * `startRun`, or the state and log where an earlier drive stopped.
 */
export async function drive(
  run: { state: RunState; log: readonly LoggedEvent[] },
  options: DriveOptions,
): Promise<Driven> {
  const ledger = options.ledger ?? memoryLedger();
  const now = options.now ?? Date.now;
  let state = run.state;
  let log = [...run.log];
  const seen = new Map<string, LedgerEntry>();
  const append = (events: Parameters<typeof appendEvents>[1]) => {
    const appended = appendEvents(log, events, now());
    log = appended.log;
    for (const e of appended.appended) options.onEvent?.(e);
  };
  checkSnapshot(state.models);

  while (!options.signal?.aborted) {
    const step = nextStep(state, now());
    if (step.kind === "done") return { state, log, calls: callLog(state, seen), done: true };
    append(beginStep(state, step));
    const results = await runCalls(state, step, {
      provider: options.provider,
      ledger,
      now,
      ...(options.renderer ? { renderer: options.renderer } : {}),
      ...(options.onCall ? { onCall: options.onCall } : {}),
    });
    for (const entry of results) seen.set(entry.result.key, entry);
    options.onStep?.(state, step, results);
    const reduced = reduce(
      state,
      step,
      results.map((entry) => entry.result),
      now(),
    );
    state = reduced.state;
    append(reduced.events);
  }
  return { state, log, calls: callLog(state, seen), done: state.status !== "running" };
}

/**
 * Makes the calls of a step in parallel, each through the ledger: a finished call is read, not
 * made; a call cut short by a restart is made once more if its timeout (which `nextStep` already
 * cut to the deadline of the run) leaves time, and abstains otherwise; a timeout, an invalid
 * output or any provider error is an abstention, stored like a result and never retried. The
 * entries come back in the order of the calls.
 */
export function runCalls(
  state: RunState,
  step: CallsStep,
  options: CallOptions,
): Promise<LedgerEntry[]> {
  return Promise.all(step.calls.map((call) => callOnce(state, call, options)));
}

async function callOnce(state: RunState, call: Call, options: CallOptions): Promise<LedgerEntry> {
  const { ledger, now } = options;
  const model = modelFor(state.models, call.seat);
  options.onCall?.(call, "start");
  const kept = await ledger.get(call.key);
  if (kept) {
    options.onCall?.(call, "end", { ...kept, cached: true });
    return kept;
  }
  const started = now();
  const abstain = (
    reason: Extract<CallResult, { status: "abstained" }>["reason"],
    error: string,
    failure: ProviderError | null = null,
  ): LedgerEntry => ({
    result: {
      status: "abstained",
      key: call.key,
      reason,
      costUsd: failure?.costUsd ?? 0,
      latencyMs: failure?.latencyMs ?? now() - started,
    },
    seat: call.seat,
    model,
    error,
    usage: failure?.usage ?? null,
  });

  let entry: LedgerEntry;
  const interrupted = (await ledger.begin?.(call.key, started)) ?? 0;
  if (interrupted > INTERRUPTED_RETRIES) {
    entry = abstain("error", `${call.key} was cut short by a restart ${interrupted} times.`);
  } else if (interrupted > 0 && call.timeoutMs <= 0) {
    entry = abstain("timeout", `${call.key} was cut short by a restart and the deadline passed.`);
  } else {
    try {
      entry =
        call.kind === "render"
          ? await renderOnce(call, options, model, started)
          : await generateOnce(call, options, model);
    } catch (error) {
      const failure = ProviderError.isInstance(error) ? error : null;
      entry = abstain(
        failure?.kind ?? "error",
        error instanceof Error ? error.message : String(error),
        failure,
      );
    }
  }
  await ledger.put(call.key, entry);
  options.onCall?.(call, "end", { ...entry, cached: false });
  return entry;
}

async function generateOnce(
  call: Call,
  options: CallOptions,
  model: ModelRef,
): Promise<LedgerEntry> {
  const out = await options.provider.generate({
    callKey: call.key,
    model,
    system: call.system,
    prompt: call.prompt,
    schema: call.schema,
    maxOutputTokens: call.maxOutputTokens,
    ...(call.search ? { search: call.search } : {}),
    signal: AbortSignal.timeout(call.timeoutMs),
  });
  return {
    result: {
      status: "ok",
      key: call.key,
      output: out.output,
      sources: out.sources,
      usage: out.usage,
      costUsd: out.costUsd,
      latencyMs: out.latencyMs,
    },
    seat: call.seat,
    model,
    error: null,
    usage: null,
  };
}

/** A render call: the renderer, under the call's timeout. */
async function renderOnce(
  call: Call,
  options: CallOptions,
  model: ModelRef,
  started: number,
): Promise<LedgerEntry> {
  if (!options.renderer || !call.render) throw new Error(`${call.key}: no renderer.`);
  const rendered = await withTimeout(
    options.renderer.render({
      key: call.key,
      specs: call.render.specs,
      signal: AbortSignal.timeout(call.timeoutMs),
    }),
    call.timeoutMs,
    call.key,
  );
  return {
    result: {
      status: "ok",
      key: call.key,
      output: rendered,
      sources: [],
      usage: { inputTokens: 0, outputTokens: 0 },
      costUsd: 0,
      latencyMs: options.now() - started,
    },
    seat: call.seat,
    model,
    error: null,
    usage: null,
  };
}

/** Rejects with a timeout ProviderError when `promise` takes longer than `ms`. */
function withTimeout<T>(promise: Promise<T>, ms: number, key: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(new ProviderError({ kind: "timeout", callKey: key, message: `${key} timed out.` })),
      ms,
    );
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

/** The call records of the run, with the error and tokens of the abstentions this drive saw. */
function callLog(state: RunState, seen: ReadonlyMap<string, LedgerEntry>): CallLogEntry[] {
  return Object.values(state.calls).map((c) => ({
    key: c.key,
    seat: c.seat,
    kind: c.kind,
    stage: c.stage,
    model: modelFor(state.models, c.seat).id,
    status: c.status,
    reason: c.reason,
    error: seen.get(c.key)?.error ?? null,
    costUsd: c.costUsd,
    latencyMs: c.latencyMs,
    inputTokens: (c.usage ?? seen.get(c.key)?.usage)?.inputTokens ?? null,
    outputTokens: (c.usage ?? seen.get(c.key)?.usage)?.outputTokens ?? null,
  }));
}
