import { normalizeUrl } from "@chebot/protocol";
import {
  createGateway,
  type generateText as GenerateText,
  generateText,
  isStepCount,
  type LanguageModel,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  Output,
  type StepResult,
  type ToolSet,
  TypeValidationError,
  tool,
} from "ai";
import {
  type FoundSource,
  type GenerateRequest,
  type GenerateResult,
  type ModelProvider,
  type ModelRef,
  ProviderError,
  type ProviderErrorKind,
  type Usage,
} from "./provider.ts";

export interface GatewayOptions {
  /** Defaults to AI_GATEWAY_API_KEY of process.env, when there is one (a Worker passes its secret). */
  apiKey?: string;
  baseURL?: string;
  fetch?: typeof globalThis.fetch;
  /** Replaces the Gateway language model, for tests. */
  languageModel?: (id: string) => LanguageModel;
  /** The wait before the one retry of a 429 or 5xx. Defaults to 1 s. */
  retryDelayMs?: number;
}

type ProviderOptions = Parameters<typeof GenerateText>[0]["providerOptions"];

export function gatewayProvider(options: GatewayOptions = {}) {
  const apiKey = options.apiKey ?? environmentKey();
  return createGateway({
    ...(apiKey ? { apiKey } : {}),
    ...(options.baseURL ? { baseURL: options.baseURL } : {}),
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });
}

function environmentKey(): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env;
  return env?.AI_GATEWAY_API_KEY || undefined;
}

/** The provider option that carries a reasoning effort through the Gateway, as courtModel() does. */
export function effortOptions(model: ModelRef): ProviderOptions {
  const effort = model.effort;
  if (!effort) return undefined;
  const provider = model.id.split("/", 1)[0];
  return provider === "spacexai"
    ? { xai: { reasoningEffort: effort } }
    : provider === "google"
      ? { google: { thinkingConfig: { thinkingLevel: effort } } }
      : provider === "anthropic"
        ? { anthropic: { effort } }
        : provider === "openai"
          ? { openai: { reasoningEffort: effort } }
          : undefined;
}

/**
 * The spend of one step as the Gateway reports it in `providerMetadata.gateway` (decimal strings).
 * `cost` is what the Gateway charges; `marketCost` is the market price of the tokens and of the
 * Gateway tools. With system credentials they are equal (cost adds surcharges); with BYOK
 * credentials `cost` holds only the Gateway tools (a search) and the provider bills the tokens,
 * so the larger of the two is the spend of the step.
 */
export function gatewayCost(providerMetadata: unknown): number | undefined {
  const gateway = (
    providerMetadata as { gateway?: { cost?: unknown; marketCost?: unknown } } | undefined
  )?.gateway;
  const values = [gateway?.cost, gateway?.marketCost]
    .map((value) => (typeof value === "string" ? Number(value) : value))
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return values.length ? Math.max(...values) : undefined;
}

// A provider-executed search may still end its step with tool calls; the object then comes in a later step.
const SEARCH_STEPS = 3;
const QUOTE_CHARS = 500;

/** What the steps of one call (both attempts, the fallback included) reported. */
class CallMeter {
  costUsd = 0;
  costReported = false;
  usage: Usage = { inputTokens: 0, outputTokens: 0 };
  searched = false;
  readonly found = new Map<string, FoundSource>();
  text = "";

  readonly onStepEnd = (step: StepResult<ToolSet>) => {
    const cost = gatewayCost(step.providerMetadata);
    if (cost !== undefined) {
      this.costUsd += cost;
      this.costReported = true;
    }
    this.usage.inputTokens += step.usage.inputTokens ?? 0;
    this.usage.outputTokens += step.usage.outputTokens ?? 0;
    if (step.text) this.text = step.text;
    for (const call of step.toolCalls) if (call.toolName === "web_search") this.searched = true;
    for (const result of step.toolResults) {
      if (result.toolName !== "web_search") continue;
      for (const source of searchResults(result.output)) {
        const key = normalizeUrl(source.url);
        if (key && !this.found.has(key)) this.found.set(key, source);
      }
    }
  };
}

export function createGatewayProvider(options: GatewayOptions = {}): ModelProvider {
  const gateway = gatewayProvider(options);
  const languageModel = options.languageModel ?? ((id: string) => gateway(id));
  const retryDelayMs = options.retryDelayMs ?? 1_000;

  return {
    async generate<T>(req: GenerateRequest<T>): Promise<GenerateResult<T>> {
      const started = Date.now();
      const meter = new CallMeter();
      const model = languageModel(req.model.id);
      const providerOptions = effortOptions(req.model);
      const tools: ToolSet | undefined = req.search
        ? {
            web_search: gateway.tools.parallelSearch({
              maxResults: req.search.maxResults,
              maxCharsTotal: 2_000 * req.search.maxResults,
            }),
          }
        : undefined;

      const objectCall = async (): Promise<T> => {
        const result = await generateText({
          model,
          providerOptions,
          instructions: req.system,
          prompt: req.prompt,
          output: Output.object({ schema: req.schema }),
          tools,
          stopWhen: isStepCount(req.search ? SEARCH_STEPS : 1),
          maxOutputTokens: req.maxOutputTokens,
          maxRetries: 0,
          abortSignal: req.signal,
          onStepEnd: meter.onStepEnd,
        });
        if (result.finishReason === "content-filter") throw refusal(req.callKey);
        return parse(req, result.output);
      };

      // The pattern of evals/tiers/submission.ts: the schema rides on a tool, and tool
      // choice stays automatic because some flagships reject a forced tool.
      const submitCall = async (): Promise<T> => {
        const result = await generateText({
          model,
          providerOptions,
          instructions: req.system,
          prompt: submitPrompt(req.prompt, [...meter.found.values()], meter.text),
          tools: {
            submit: tool({
              description: "Submit the final answer in the required structure. Call it once.",
              inputSchema: req.schema,
            }),
          },
          toolChoice: "auto",
          stopWhen: isStepCount(1),
          maxOutputTokens: req.maxOutputTokens,
          maxRetries: 0,
          abortSignal: req.signal,
          onStepEnd: meter.onStepEnd,
        });
        if (result.finishReason === "content-filter") throw refusal(req.callKey);
        const call = result.toolCalls.find((candidate) => candidate.toolName === "submit");
        if (!call || ("invalid" in call && call.invalid))
          throw new NoObjectGeneratedError({
            message: "The model did not call submit with a valid object.",
            text: result.text,
            response: result.response,
            usage: result.usage,
            finishReason: result.finishReason,
          });
        return parse(req, call.input);
      };

      const attempt = async (): Promise<{ output: T; via: GenerateResult<T>["via"] }> => {
        try {
          return { output: await objectCall(), via: "output" };
        } catch (error) {
          if (!req.search || !meter.searched || errorKind(error, req.signal) !== "invalid")
            throw error;
          return { output: await submitCall(), via: "submit" };
        }
      };

      try {
        let result: Awaited<ReturnType<typeof attempt>>;
        try {
          result = await attempt();
        } catch (error) {
          if (!retryable(error) || req.signal.aborted) throw error;
          await wait(retryDelayMs, req.signal);
          result = await attempt();
        }
        return {
          output: result.output,
          sources: citedSources(result.output, meter.found),
          usage: meter.usage,
          costUsd: meter.costUsd,
          latencyMs: Date.now() - started,
          via: result.via,
        };
      } catch (error) {
        const kind = errorKind(error, req.signal);
        throw new ProviderError({
          kind,
          callKey: req.callKey,
          message: `${req.callKey} (${req.model.id}): ${kind}: ${error instanceof Error ? error.message : String(error)}`,
          costUsd: meter.costReported ? meter.costUsd : undefined,
          usage: meter.usage,
          latencyMs: Date.now() - started,
          cause: error,
        });
      }
    },
  };
}

// Output.object already validated with the same schema; parsing again keeps the guarantee
// independent of the SDK path that produced the value (the submit tool included).
function parse<T>(req: GenerateRequest<T>, value: unknown): T {
  const parsed = req.schema.safeParse(value);
  if (!parsed.success) throw new TypeValidationError({ value, cause: parsed.error });
  return parsed.data;
}

function refusal(callKey: string): ProviderError {
  return new ProviderError({ kind: "refusal", callKey, message: `${callKey} was refused.` });
}

export function errorKind(error: unknown, signal: AbortSignal): ProviderErrorKind {
  if (ProviderError.isInstance(error)) return error.kind;
  if (signal.aborted || isAbort(error)) return "timeout";
  if (NoObjectGeneratedError.isInstance(error))
    return error.finishReason === "content-filter" ? "refusal" : "invalid";
  if (NoOutputGeneratedError.isInstance(error) || TypeValidationError.isInstance(error))
    return "invalid";
  return "error";
}

function isAbort(error: unknown): boolean {
  for (let current = error, depth = 0; current && depth < 5; depth++) {
    const name = (current as { name?: unknown }).name;
    if (name === "AbortError" || name === "TimeoutError") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/** A 429 or a 5xx, on the error or its cause (Gateway errors and APICallError carry statusCode). */
export function retryable(error: unknown): boolean {
  for (let current = error, depth = 0; current && depth < 5; depth++) {
    const status = (current as { statusCode?: unknown }).statusCode;
    if (typeof status === "number") return status === 429 || status >= 500;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    signal.addEventListener("abort", abort, { once: true });
  });
}

function searchResults(output: unknown): FoundSource[] {
  const results = (output as { results?: unknown } | null)?.results;
  if (!Array.isArray(results)) return [];
  return results.flatMap((entry): FoundSource[] => {
    const result = entry as { url?: unknown; title?: unknown; excerpts?: unknown } | null;
    if (typeof result?.url !== "string") return [];
    const excerpts = Array.isArray(result.excerpts)
      ? result.excerpts.filter((item): item is string => typeof item === "string")
      : [];
    const quote = excerpts.join(" ").replace(/\s+/g, " ").trim().slice(0, QUOTE_CHARS);
    const named = typeof result.title === "string" ? result.title.replace(/\s+/g, " ").trim() : "";
    const title = named || result.url;
    return [{ url: result.url, title, quote }];
  });
}

const URLS = /https?:\/\/[^\s<>"'`)\]]+/g;

/** The search results whose URL appears in the output, in order of first appearance. */
export function citedSources(
  output: unknown,
  found: ReadonlyMap<string, FoundSource>,
): FoundSource[] {
  const cited = new Map<string, FoundSource>();
  const visit = (value: unknown): void => {
    if (typeof value === "string") {
      for (const match of value.matchAll(URLS)) {
        const key = normalizeUrl(match[0].replace(/[.,;:!?]+$/, ""));
        const source = key ? found.get(key) : undefined;
        if (key && source && !cited.has(key)) cited.set(key, source);
      }
    } else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") Object.values(value).forEach(visit);
  };
  visit(output);
  return [...cited.values()];
}

function submitPrompt(prompt: string, found: FoundSource[], text: string): string {
  const results = found
    .map((source, index) => `[${index + 1}] ${source.title}\n${source.url}\n${source.quote}`)
    .join("\n\n");
  return [
    prompt,
    "---",
    found.length
      ? `You already searched the web. These are the results; cite only these URLs:\n\n${results}`
      : "You already searched the web and found nothing usable.",
    text ? `Your answer so far:\n\n${text}` : "",
    "Now call the submit tool once with your final answer.",
  ]
    .filter(Boolean)
    .join("\n\n");
}
