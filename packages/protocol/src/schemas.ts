import { z } from "zod";
import type { CallKind } from "./config.ts";

// The structured outputs of every model call. Kept to the subset every provider accepts:
// every field required, string enums, plain arrays; no optional or nullable fields, no numeric
// or length limits, no recursion (schemas.test.ts checks it). Limits a schema cannot express
// (caps, one sentence) are enforced by the reducer.

export const draftSchema = z.object({
  answer: z.string().describe("The complete answer, in paragraphs separated by blank lines."),
  claims: z
    .array(
      z.object({
        text: z.string().describe("One self-contained statement the answer rests on."),
        confidence: z.enum(["high", "medium", "low"]),
        sources: z
          .array(z.string())
          .describe("URLs found with the search tool that support the claim; empty if none."),
      }),
    )
    .describe("The key claims of the answer, in order."),
});

export const mergeSchema = z.object({
  paragraphs: z.array(
    z.object({
      text: z.string(),
      claims: z.array(z.string()).describe("Ids of the claims this paragraph carries."),
    }),
  ),
  conflicts: z
    .array(z.object({ first: z.string(), second: z.string() }))
    .describe("Pairs of claim ids that contradict each other."),
});

const suggestionSchema = z.object({
  paragraph: z.string().describe("The id of the paragraph, such as p3."),
  op: z.enum(["replace", "insert_after", "delete"]),
  kind: z.enum(["wrong", "missing", "misleading", "style"]),
  text: z.string().describe("The new paragraph text; empty for delete."),
  reason: z.string().describe("One sentence."),
  sources: z.array(z.string()).describe("Source ids from the list, such as src2."),
});

const voteSchema = z.object({
  thread: z.string().describe("The id of the thread, such as t2."),
  choice: z.string().describe('A suggestion id of the thread, or "keep".'),
  reason: z.string().describe("One sentence; required when you change your position."),
});

export const round1Schema = z.object({ suggestions: z.array(suggestionSchema) });
export const round2Schema = z.object({
  votes: z.array(voteSchema),
  suggestions: z.array(suggestionSchema),
});
export const round3Schema = z.object({ votes: z.array(voteSchema) });

export const dedupeSchema = z.object({
  pairs: z.array(z.object({ pair: z.string(), verdict: z.enum(["same", "different"]) })),
});

export const editorSchema = z.object({
  paragraphs: z
    .array(z.object({ id: z.string(), text: z.string() }))
    .describe("Only the paragraphs you changed, with their full new text."),
});

export const editorCheckSchema = z.object({
  checks: z.array(z.object({ id: z.string(), verdict: z.enum(["same", "changed"]) })),
});

export const momentsSchema = z.object({
  sentences: z.array(z.string()).describe("At most 3 short sentences."),
});

export const SCHEMAS = {
  draft: draftSchema,
  merge: mergeSchema,
  round1: round1Schema,
  round2: round2Schema,
  round3: round3Schema,
  dedupe: dedupeSchema,
  editor: editorSchema,
  editor_check: editorCheckSchema,
  moments: momentsSchema,
} as const satisfies Record<CallKind, z.ZodType>;

export type OutputOf<K extends CallKind> = z.infer<(typeof SCHEMAS)[K]>;
export type SuggestionOutput = z.infer<typeof suggestionSchema>;
export type VoteOutput = z.infer<typeof voteSchema>;

export function schemaFor<K extends CallKind>(kind: K): (typeof SCHEMAS)[K] {
  return SCHEMAS[kind];
}
