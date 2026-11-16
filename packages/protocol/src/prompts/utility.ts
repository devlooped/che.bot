import type { Snapshot } from "../model.ts";
import { LANGUAGE_RULE, type Prompt, renderDocument, STRUCTURED_RULE } from "./common.ts";

export interface PairView {
  id: string;
  paragraph: string; // the current text of the targeted paragraph
  first: { op: string; text: string };
  second: { op: string; text: string };
}

export function dedupePrompt(input: { pairs: readonly PairView[] }): Prompt {
  return {
    system: [
      "You compare suggested changes to a paragraph of a document. For each pair, answer same when both make the same change in substance (they would leave the document saying the same thing, even in other words), and different otherwise.",
      "A change that goes further, corrects a different point or adds a different fact is different.",
      STRUCTURED_RULE,
    ].join("\n"),
    prompt: input.pairs
      .map((p) =>
        [
          `## ${p.id}`,
          `Paragraph: "${p.paragraph}"`,
          `First: ${p.first.op}${p.first.text ? ` "${p.first.text}"` : ""}`,
          `Second: ${p.second.op}${p.second.text ? ` "${p.second.text}"` : ""}`,
        ].join("\n"),
      )
      .join("\n\n"),
  };
}

export function editorPrompt(input: {
  question: string;
  snapshot: Snapshot;
  changed: readonly string[];
}): Prompt {
  return {
    system: [
      "You are the editor of an answer that four reviewers wrote together. Some paragraphs were just changed by accepted suggestions, so the text may now repeat itself, contradict its own order, or refer to something no longer there.",
      "Smooth the wording and fix those inconsistencies. No change of substance: keep every claim, figure, date, name, qualifier, caveat and stated disagreement exactly as it is; add nothing and remove nothing that the text asserts. Do not take sides where the text reports a disagreement.",
      "Every rewrite is checked against the original; a rewrite that changes a claim is discarded.",
      "Return only the paragraphs you changed, by id, with their full new text. Return an empty list if the text reads well.",
      LANGUAGE_RULE,
      STRUCTURED_RULE,
    ].join("\n"),
    prompt: `Question:\n${input.question}\n\nParagraphs changed in the rounds: ${input.changed.join(", ") || "none"}\n\nThe answer:\n\n${renderDocument(input.snapshot, false)}`,
  };
}

export function editorCheckPrompt(input: {
  rewrites: readonly { id: string; before: string; after: string }[];
}): Prompt {
  return {
    system: [
      "You check an editor's rewrites. For each paragraph, answer same when the rewrite makes exactly the same claims as the original (same facts, figures, dates, names, qualifiers and positions, nothing added or removed), and changed otherwise. Wording, order and style do not matter.",
      STRUCTURED_RULE,
    ].join("\n"),
    prompt: input.rewrites
      .map((r) => `## ${r.id}\nOriginal: "${r.before}"\nRewrite: "${r.after}"`)
      .join("\n\n"),
  };
}

const LANGUAGE_NAMES: Record<string, string> = {
  "es-AR":
    "Spanish as spoken in Buenos Aires (rioplatense): voseo (vos, tenés, mirá), plain everyday words",
  es: "Spanish",
  en: "English",
};

export function languageName(tag: string): string {
  return LANGUAGE_NAMES[tag] ?? LANGUAGE_NAMES[tag.split("-")[0] ?? ""] ?? tag;
}

export function momentsPrompt(input: {
  question: string;
  language: string;
  facts: readonly string[];
}): Prompt {
  return {
    system: [
      "Four AI assistants (Grok, Claude, ChatGPT and Gemini) are answering a person's question together. You write the short live commentary the person reads while they work.",
      `Turn the events below into at most 3 short sentences, in ${languageName(input.language)}.`,
      "Say only what the events say. Plain words for anyone: no technical terms (no model, thread, round, token, prompt, vote count jargon). Name the assistants by name. Be neutral: do not praise or blame.",
      STRUCTURED_RULE,
    ].join("\n"),
    prompt: `Question: ${input.question}\n\nEvents:\n${input.facts.map((f) => `- ${f}`).join("\n")}`,
  };
}
