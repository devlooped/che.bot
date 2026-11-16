import {
  type Experimental_DecisionModel,
  Experimental_DecisionRefusalError,
  experimental_decide,
  InvalidResponseDataError,
} from "ai";
import { type GatewayOptions, gatewayCost, gatewayProvider } from "./gateway.ts";
import { type ModelRef, ProviderError, type Usage } from "./provider.ts";

export type QuestionClass = "simple" | "complex";

/** A choice less sure than this counts as complex. */
export const CLASS_THRESHOLD = 0.7;

export interface ClassifyRequest {
  question: string;
  /** The classifier of the run snapshot. */
  model: ModelRef;
  signal: AbortSignal;
}

export interface Classification {
  /** The class that sets the mode and the price, after the threshold rule. */
  class: QuestionClass;
  /** What the decision model chose. */
  choice: QuestionClass;
  /** The probability of that choice; null when the model gives no distribution. */
  probability: number | null;
  usage: Usage;
  costUsd: number;
  latencyMs: number;
}

export interface ClassifyOptions extends GatewayOptions {
  /** Replaces the Gateway decision model, for tests. */
  decisionModel?: (id: string) => Experimental_DecisionModel;
}

export const COMPLEXITY_QUESTION = {
  type: "choice",
  instructions: "How much work does a reliable answer to this question need?",
  criteria: {
    simple: "one fact or definition that can be answered directly, with nothing disputable",
    complex: "needs sources compared, several steps of reasoning, or has disputable points",
  },
} as const;

/** Simple only when the model chose simple with a probability of at least 0.7; an unknown probability is unsure. */
export function classOf(choice: QuestionClass, probability: number | null): QuestionClass {
  return choice === "simple" && probability !== null && probability >= CLASS_THRESHOLD
    ? "simple"
    : "complex";
}

export async function classify(
  req: ClassifyRequest,
  options: ClassifyOptions = {},
): Promise<Classification> {
  const started = Date.now();
  const decisionModel =
    options.decisionModel ?? ((id: string) => gatewayProvider(options).decisionModel(id));
  try {
    const result = await experimental_decide({
      model: decisionModel(req.model.id),
      state: { question: req.question },
      questions: { complexity: COMPLEXITY_QUESTION },
      maxRetries: 0,
      abortSignal: req.signal,
    });
    const answer = result.answers.complexity;
    const probability = answer.probabilities?.[answer.choice] ?? null;
    return {
      class: classOf(answer.choice, probability),
      choice: answer.choice,
      probability,
      usage: {
        inputTokens: result.usage.inputTokens ?? 0,
        outputTokens: result.usage.outputTokens ?? 0,
      },
      costUsd: gatewayCost(result.providerMetadata) ?? 0,
      latencyMs: Date.now() - started,
    };
  } catch (error) {
    const kind = req.signal.aborted
      ? "timeout"
      : Experimental_DecisionRefusalError.isInstance(error)
        ? "refusal"
        : InvalidResponseDataError.isInstance(error)
          ? "invalid"
          : "error";
    throw new ProviderError({
      kind,
      callKey: "classify",
      message: `classify (${req.model.id}): ${kind}: ${error instanceof Error ? error.message : String(error)}`,
      latencyMs: Date.now() - started,
      cause: error,
    });
  }
}
