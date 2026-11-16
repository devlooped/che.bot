import { LANGUAGE_RULE, type Prompt, quote, STRUCTURED_RULE } from "./common.ts";

export interface MergeDraft {
  label: string; // "A": drafts are anonymized
  answer: string;
  claims: { id: string; text: string; confidence: string }[];
}

export function mergePrompt(input: { question: string; drafts: readonly MergeDraft[] }): Prompt {
  const drafts = input.drafts
    .map((d) =>
      [
        `## Draft ${d.label}`,
        quote(d.answer),
        "Claims:",
        ...d.claims.map((c) => `- ${c.id} [${c.confidence}] ${c.text}`),
      ].join("\n"),
    )
    .join("\n\n");
  return {
    system: [
      "You merge independent drafts that answer the same question into one document. You are a careful clerk, not a judge: you do not decide who is right.",
      "Rules:",
      "- Every claim id of every draft must be listed in at least one paragraph. A claim left out is added back at the end of the document by code, out of place.",
      "- Group claims that say the same thing in the same paragraph, and list all their ids there. Write each paragraph from the claims it lists; add no fact that no draft states.",
      "- When drafts disagree, write the paragraph so that it states each position fairly, list the claims of both sides, and report each contradicting pair in conflicts.",
      "- conflicts: pairs of claim ids that cannot both be true or both be followed. Not claims that merely differ in detail or emphasis.",
      "- Order the paragraphs so that the document reads as one answer: the direct answer first, then the support, then the caveats.",
      LANGUAGE_RULE,
      STRUCTURED_RULE,
    ].join("\n"),
    prompt: `Question:\n${input.question}\n\n${drafts}`,
  };
}
