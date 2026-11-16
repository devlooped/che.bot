import {
  appendEvents,
  beginStep,
  type Call,
  type CallResult,
  type CallsStep,
  type CreateRunInput,
  createRun,
  type LoggedEvent,
  MODELS,
  type ModelSnapshot,
  nextStep,
  type RunState,
  reduce,
  type Seat,
} from "@chebot/protocol";
import { type ModelProvider, type ModelRef, ProviderError, type Usage } from "@chebot/providers";

// The local driver: the loop the Durable Object will run, one step per alarm. The orchestrator
// (nextStep, reduce) decides; the driver makes the calls of a step in parallel, keeps every result
// in a ledger as it lands, and appends the events.

/** A finished call, as the ledger keeps it. */
export interface LedgerEntry {
  result: CallResult;
  seat: Seat;
  model: ModelRef;
  /** The message of the provider error, for an abstention. */
  error: string | null;
  /** The tokens an abstained call reported before it failed (an ok result carries its own). */
  usage: Usage | null;
}

/**
 * Where the results of finished calls are kept, by call key. A call whose key is in the ledger is
 * never made again: a rerun or a resumed run reads the result instead. In memory by default; the
 * evaluation keeps it on disk and the Durable Object in SQLite. One ledger per run.
 */
export interface CallLedger {
  get(key: string): Promise<LedgerEntry | undefined>;
  put(key: string, entry: LedgerEntry): Promise<void>;
}

export function memoryLedger(): CallLedger & { entries: Map<string, LedgerEntry> } {
  const entries = new Map<string, LedgerEntry>();
  return {
    entries,
    get: async (key) => entries.get(key),
    put: async (key, entry) => {
      entries.set(key, entry);
    },
  };
}

/** One line of the call log. */
export interface CallLogEntry {
  key: string;
  seat: Seat;
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

export interface DriveOptions {
  provider: ModelProvider;
  ledger?: CallLedger;
  /** The clock: the run's deadline and the time of every event. */
  now?: () => number;
  /** Each event as it is appended to the log. */
  onEvent?: (event: LoggedEvent) => void;
  /** Each call as it is made (or read from the ledger) and as it lands. */
  onCall?: (call: Call, phase: "start" | "end", entry?: LedgerEntry & { cached: boolean }) => void;
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

export function modelFor(models: ModelSnapshot, seat: Seat): ModelRef {
  const model = models[roleOf(seat)];
  if (!model) throw new Error(`The model snapshot of the run has no ${roleOf(seat)}.`);
  return model;
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
  for (const seat of [...MODELS, "utility" as const]) modelFor(state.models, seat);

  while (!options.signal?.aborted) {
    const step = nextStep(state, now());
    if (step.kind === "done") return { state, log, calls: callLog(state, seen), done: true };
    append(beginStep(state, step));
    const results = await Promise.all(
      step.calls.map((call) => execute(state, call, ledger, options, now)),
    );
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

async function execute(
  state: RunState,
  call: Call,
  ledger: CallLedger,
  options: DriveOptions,
  now: () => number,
): Promise<LedgerEntry> {
  const model = modelFor(state.models, call.seat);
  options.onCall?.(call, "start");
  const kept = await ledger.get(call.key);
  if (kept) {
    options.onCall?.(call, "end", { ...kept, cached: true });
    return kept;
  }
  const started = now();
  let entry: LedgerEntry;
  try {
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
    entry = {
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
  } catch (error) {
    const failure = ProviderError.isInstance(error) ? error : null;
    entry = {
      result: {
        status: "abstained",
        key: call.key,
        reason: failure?.kind ?? "error",
        costUsd: failure?.costUsd ?? 0,
        latencyMs: failure?.latencyMs ?? now() - started,
      },
      seat: call.seat,
      model,
      error: error instanceof Error ? error.message : String(error),
      usage: failure?.usage ?? null,
    };
  }
  await ledger.put(call.key, entry);
  options.onCall?.(call, "end", { ...entry, cached: false });
  return entry;
}

/** The call records of the run, with the error and tokens of the abstentions this drive saw. */
function callLog(state: RunState, seen: ReadonlyMap<string, LedgerEntry>): CallLogEntry[] {
  return Object.values(state.calls).map((c) => ({
    key: c.key,
    seat: c.seat,
    kind: c.kind,
    stage: c.stage,
    model: state.models[roleOf(c.seat)]?.id ?? "",
    status: c.status,
    reason: c.reason,
    error: seen.get(c.key)?.error ?? null,
    costUsd: c.costUsd,
    latencyMs: c.latencyMs,
    inputTokens: (c.usage ?? seen.get(c.key)?.usage)?.inputTokens ?? null,
    outputTokens: (c.usage ?? seen.get(c.key)?.usage)?.outputTokens ?? null,
  }));
}
