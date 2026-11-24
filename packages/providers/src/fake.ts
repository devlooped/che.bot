import {
  type FoundSource,
  type GenerateRequest,
  type GenerateResult,
  type ModelProvider,
  ProviderError,
  type Usage,
} from "./provider.ts";

/**
 * What a scripted call does. Every outcome may wait `delayMs` first; the wait honors the
 * request's signal, so a delay longer than the call timeout ends as a timeout.
 * - output: the canned output, run through the request's schema (an invalid one fails as "invalid").
 *   Its `thoughts` go to the request's `onProgress`, one paragraph after another across the delay,
 *   word by word, as a model's reasoning streams.
 * - timeout: never answers; fails as "timeout" when the signal aborts.
 * - refusal / error: fails with that kind.
 */
export type FakeOutcome =
  | {
      kind?: "output";
      output: unknown;
      sources?: FoundSource[];
      usage?: Usage;
      costUsd?: number;
      delayMs?: number;
      thoughts?: string[];
    }
  | { kind: "timeout"; costUsd?: number }
  | { kind: "refusal"; costUsd?: number; delayMs?: number }
  | { kind: "error"; message?: string; costUsd?: number; delayMs?: number };

export type FakeResponder = (
  req: GenerateRequest<unknown>,
  attempt: number,
) => FakeOutcome | Promise<FakeOutcome>;

export interface FakeScript {
  /** Outcomes by exact callKey; a function receives the request and how many times the key was asked before. */
  calls?: Record<string, FakeOutcome | FakeResponder>;
  /** For keys that `calls` does not list. Without it, an unlisted key fails as "error". */
  respond?: FakeResponder;
  /** The cost of a call whose outcome sets none. Defaults to 0. */
  costUsd?: number;
}

export interface FakeCall {
  callKey: string;
  model: GenerateRequest<unknown>["model"];
  system: string;
  prompt: string;
  maxOutputTokens: number;
  search: GenerateRequest<unknown>["search"];
  result: "output" | ProviderError["kind"];
  costUsd: number;
}

export class FakeProvider implements ModelProvider {
  readonly calls: FakeCall[] = [];

  constructor(private readonly script: FakeScript = {}) {}

  /** How many times each call key was requested. */
  counts(): Map<string, number> {
    const counts = new Map<string, number>();
    for (const call of this.calls) counts.set(call.callKey, (counts.get(call.callKey) ?? 0) + 1);
    return counts;
  }

  /** The call keys requested more than once: empty when every call was made exactly once. */
  repeated(): string[] {
    return [...this.counts()].filter(([, count]) => count > 1).map(([key]) => key);
  }

  async generate<T>(req: GenerateRequest<T>): Promise<GenerateResult<T>> {
    const started = Date.now();
    const attempt = this.calls.filter((call) => call.callKey === req.callKey).length;
    const call: FakeCall = {
      callKey: req.callKey,
      model: req.model,
      system: req.system,
      prompt: req.prompt,
      maxOutputTokens: req.maxOutputTokens,
      search: req.search,
      result: "error",
      costUsd: 0,
    };
    this.calls.push(call);
    const fail = (kind: ProviderError["kind"], message: string, costUsd?: number): never => {
      call.result = kind;
      call.costUsd = costUsd ?? 0;
      throw new ProviderError({
        kind,
        callKey: req.callKey,
        message,
        costUsd,
        latencyMs: Date.now() - started,
      });
    };

    const scripted = this.script.calls?.[req.callKey] ?? this.script.respond;
    if (!scripted) return fail("error", `No scripted outcome for ${req.callKey}.`);
    const outcome =
      typeof scripted === "function"
        ? await scripted(req as GenerateRequest<unknown>, attempt)
        : scripted;
    const costUsd = outcome.costUsd ?? this.script.costUsd ?? 0;

    if (outcome.kind === "timeout") {
      await waitForAbort(req.signal);
      return fail("timeout", `${req.callKey} timed out.`, costUsd);
    }
    const thoughts =
      outcome.kind === undefined || outcome.kind === "output" ? outcome.thoughts : [];
    if (!(await think(thoughts ?? [], outcome.delayMs ?? 0, req)))
      return fail("timeout", `${req.callKey} timed out.`, costUsd);
    if (outcome.kind === "refusal") return fail("refusal", `${req.callKey} was refused.`, costUsd);
    if (outcome.kind === "error")
      return fail("error", outcome.message ?? `${req.callKey} failed.`, costUsd);

    const parsed = req.schema.safeParse(outcome.output);
    if (!parsed.success)
      return fail(
        "invalid",
        `${req.callKey} returned an invalid object: ${parsed.error.message}`,
        costUsd,
      );
    call.result = "output";
    call.costUsd = costUsd;
    return {
      output: parsed.data,
      sources: outcome.sources ?? [],
      usage: outcome.usage ?? { inputTokens: 0, outputTokens: 0 },
      costUsd,
      latencyMs: Date.now() - started,
      via: "output",
    };
  }
}

/**
 * Waits `ms`, telling `onProgress` the words of the thoughts evenly across the wait (each
 * paragraph after a blank line). False as soon as the signal aborts.
 */
async function think(
  thoughts: readonly string[],
  ms: number,
  req: Pick<GenerateRequest<unknown>, "onProgress" | "signal">,
): Promise<boolean> {
  const words = req.onProgress
    ? thoughts.flatMap((paragraph, p) =>
        paragraph
          .split(/\s+/)
          .filter(Boolean)
          .map((word, w) => (w === 0 ? (p === 0 ? word : `\n\n${word}`) : ` ${word}`)),
      )
    : [];
  if (words.length === 0) return delay(ms, req.signal);
  const gap = ms / (words.length + 1);
  for (const word of words) {
    if (!(await delay(gap, req.signal))) return false;
    req.onProgress?.(word);
  }
  return delay(gap, req.signal);
}

function waitForAbort(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) =>
    signal.addEventListener("abort", () => resolve(), { once: true }),
  );
}

/** Resolves true after `ms`, or false as soon as the signal aborts. */
function delay(ms: number, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false);
  if (ms <= 0) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve(true);
    }, ms);
    const abort = () => {
      clearTimeout(timer);
      resolve(false);
    };
    signal.addEventListener("abort", abort, { once: true });
  });
}
