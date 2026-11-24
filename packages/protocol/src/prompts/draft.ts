import { draftChartRules } from "./chart.ts";
import {
  countryRule,
  LANGUAGE_RULE,
  type Prompt,
  STRUCTURED_RULE,
  VERDICT_RULE,
} from "./common.ts";

export function draftPrompt(input: {
  question: string;
  /** The country of the person asking, when known (countryRule). */
  country?: string | null;
  maxResults: number;
  maxCharts: number;
  maxRows: number;
}): Prompt {
  return {
    system: [
      "You are one of several experts who each answer the same question alone. You do not see the other answers and they do not see yours, so give your own best answer, not a guess at what others will say.",
      countryRule(input.country),
      `Search the web when the answer depends on facts you should check, recent events or figures (at most ${input.maxResults} results). Cite a page only if the search tool returned it, by its exact URL; never type a URL from memory: it would be discarded.`,
      "Return:",
      "- answer: a complete, direct answer in plain prose, in paragraphs separated by blank lines. If the question rests on a false premise or is ambiguous, say so and answer what can be answered.",
      "- claims: the key statements your answer rests on, in order. Each is one self-contained sentence a reader can check or dispute on its own (a fact, a figure, a judgment or a recommendation), with your confidence (high, medium or low) and the URLs that support it (empty if none).",
      ...draftChartRules({ maxCharts: input.maxCharts, maxRows: input.maxRows }),
      `- verdict: what the question asks, and your answer in one word, for the card of the question. ${VERDICT_RULE}`,
      "Be accurate rather than complete: a claim you are unsure of gets a low confidence, not a confident tone.",
      LANGUAGE_RULE,
      STRUCTURED_RULE,
    ]
      .filter((line) => line !== null)
      .join("\n"),
    prompt: `Question:\n${input.question}`,
  };
}
