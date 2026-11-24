import type { z } from "zod";

/** A web page that the search tool of a call returned. The protocol assigns ids and `foundBy`. */
export interface FoundSource {
  url: string;
  title: string;
  quote: string;
}

/** A concrete model of the run snapshot: a Gateway id and its reasoning effort. */
export interface ModelRef {
  id: string;
  effort: string | null;
}

export interface GenerateRequest<T> {
  /** The idempotency key of the call, such as "draft:0:grok". */
  callKey: string;
  model: ModelRef;
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  maxOutputTokens: number;
  search?: { maxResults: number };
  /** The per-call timeout: when it aborts, the call fails with kind "timeout". */
  signal: AbortSignal;
  /**
   * What the model thinks and writes as prose while it answers (never the structured output or a
   * tool call), as it comes; a new part starts with a blank line. For display only: the result is
   * the same with or without it.
   */
  onProgress?: (text: string) => void;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

export interface GenerateResult<T> {
  output: T;
  /** Search results of this call that the output cites; never a URL the model typed. */
  sources: FoundSource[];
  usage: Usage;
  /** The spend the Gateway reported for every step and the retry of this call (see gatewayCost); 0 when it reported nothing. */
  costUsd: number;
  latencyMs: number;
  /** "submit" when the object came from the submit-tool fallback after a search. */
  via: "output" | "submit";
}

export interface ModelProvider {
  generate<T>(req: GenerateRequest<T>): Promise<GenerateResult<T>>;
}

/**
 * - timeout: the request's signal aborted.
 * - invalid: no object, or one that does not match the schema.
 * - refusal: the model declined (a content filter).
 * - error: anything else, such as an HTTP error after the retry.
 * A driver turns each of them into an abstention.
 */
export type ProviderErrorKind = "timeout" | "invalid" | "refusal" | "error";

export class ProviderError extends Error {
  override readonly name = "ProviderError";
  readonly kind: ProviderErrorKind;
  readonly callKey: string;
  /** The cost reported before the failure, when any step reported one. */
  readonly costUsd: number | undefined;
  readonly usage: Usage | undefined;
  readonly latencyMs: number | undefined;

  constructor(options: {
    kind: ProviderErrorKind;
    callKey: string;
    message: string;
    costUsd?: number | undefined;
    usage?: Usage | undefined;
    latencyMs?: number | undefined;
    cause?: unknown;
  }) {
    super(options.message, { cause: options.cause });
    this.kind = options.kind;
    this.callKey = options.callKey;
    this.costUsd = options.costUsd;
    this.usage = options.usage;
    this.latencyMs = options.latencyMs;
  }

  static isInstance(error: unknown): error is ProviderError {
    return error instanceof ProviderError;
  }
}
