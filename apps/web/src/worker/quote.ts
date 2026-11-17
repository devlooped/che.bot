import type { QuestionClass } from "@chebot/protocol";
import { deps } from "./deps.ts";
import type { Env } from "./env.ts";
import { runStub } from "./run-object.ts";
import { priceOf, resolveRunModels } from "./settings.ts";

// The quote of POST /api/runs: the decision model classes the question simple or complex, and
// the class sets the price, nothing else. No panel model is called before payment.

/** The longest question taken, in characters. */
export const MAX_QUESTION_CHARS = 2_000;
/** The classification gives up after this long, and the question counts as complex. */
export const CLASSIFY_TIMEOUT_MS = 15_000;

export interface Quote {
  runId: string;
  class: QuestionClass;
  amount: number;
  currency: string;
}

/** The question of a request body, trimmed, or why it is refused. */
export function questionOf(body: unknown): { question: string } | { error: string } {
  const question = (body as { question?: unknown } | null)?.question;
  if (typeof question !== "string" || !question.trim()) return { error: "Write a question." };
  const trimmed = question.trim();
  if (trimmed.length > MAX_QUESTION_CHARS)
    return { error: `A question has at most ${MAX_QUESTION_CHARS} characters.` };
  return { question: trimmed };
}

/**
 * Classifies the question with the classifier of the current settings; a failed classification,
 * or a choice under 0.7 (`classify` applies the rule), counts as complex. Resolving every role
 * also checks that a run of these settings could start before anyone pays for it.
 */
export async function classifyQuestion(
  env: Env,
  question: string,
): Promise<{ class: QuestionClass; probability: number | null; costUsd: number }> {
  const model = (await resolveRunModels(env)).classifier;
  if (!model) throw new Error("The settings have no classifier.");
  try {
    const result = await deps.classifier(env).classify({
      question,
      model,
      signal: AbortSignal.timeout(CLASSIFY_TIMEOUT_MS),
    });
    return { class: result.class, probability: result.probability, costUsd: result.costUsd };
  } catch (error) {
    console.warn("The classification failed; the question counts as complex.", error);
    return { class: "complex", probability: null, costUsd: 0 };
  }
}

/** Classifies, reads the price of the class, and creates the run in its object. */
export async function quoteQuestion(
  env: Env,
  owner: string,
  question: string,
): Promise<Quote & { costUsd: number }> {
  const classification = await classifyQuestion(env, question);
  const price = await priceOf(env.DB, classification.class);
  const id = crypto.randomUUID();
  const summary = await runStub(env, id).quote({
    id,
    owner,
    question,
    class: classification.class,
    probability: classification.probability,
    amount: price.amount,
    currency: price.currency,
  });
  return {
    runId: summary.id,
    class: summary.class,
    amount: summary.amount,
    currency: summary.currency,
    costUsd: classification.costUsd,
  };
}
