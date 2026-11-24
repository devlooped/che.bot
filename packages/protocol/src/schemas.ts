import { z } from "zod";
import type { CallKind } from "./config.ts";

// The structured outputs of every model call. Kept to the subset every provider accepts:
// every field required, string enums, plain arrays; no optional or nullable fields, no numeric
// or length limits, no recursion (schemas.test.ts checks it). Limits a schema cannot express
// (caps, one sentence) are enforced by the reducer.

// Numbers, specs and patch values travel as strings (JSON where they are structured), read and
// checked by code: the subset has no numbers and no open objects.

const markSchema = z
  .enum(["bar", "line", "point", "area"])
  .describe("The kind of chart that shows the data best.");

/** A chart a draft proposes: one measure along one dimension, every value with its citation. */
export const chartBriefSchema = z.object({
  question: z.string().describe("The question the chart answers, in one sentence."),
  dimension: z
    .string()
    .describe("What each row is, as the label of its axis, such as Mes or Ciudad."),
  measure: z
    .string()
    .describe("The one value the chart compares, with its unit, such as Inflación mensual (%)."),
  mark: markSchema,
  rows: z
    .array(
      z.object({
        key: z
          .string()
          .describe(
            "The label of the row: a date as YYYY, YYYY-MM or YYYY-MM-DD; a place or a name as the question writes it.",
          ),
        value: z
          .string()
          .describe(
            "The number, digits only with a dot for decimals and no thousands separator, such as 2.7 or 3121707.",
          ),
        source: z
          .string()
          .describe("The exact URL of a search result of yours that states the value."),
        quote: z.string().describe("The exact words of that page that state the value."),
      }),
    )
    .describe("The data, one row per value, each with its citation."),
});

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
  charts: z
    .array(chartBriefSchema)
    .describe(
      "Up to 3 charts, one per measure, when figures compared across time, places or categories make the answer clearer; [] otherwise.",
    ),
  verdict: z.object({
    kind: z
      .enum(["claim", "question", "fact"])
      .describe("What the question asks: to check a claim, a yes or a no, or a fact."),
    rating: z
      .enum(["true", "false", "depends", "unknown", "none"])
      .describe("Your answer in one word; none for a fact."),
  }),
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

const patchSchema = z.object({
  chart: z.string().describe("The id of the chart, such as c1."),
  layer: z.enum(["data", "transform", "encoding", "title", "caption"]),
  path: z.string().describe('Where in the layer, such as "encoding.y.title", "mark", "0" or "".'),
  value: z.string().describe("The new value as JSON (a text may be plain); null removes the path."),
  kind: z.enum(["wrong", "missing", "misleading", "style"]),
  reason: z.string().describe("One sentence."),
  sources: z.array(z.string()).describe("Source ids from the list, such as src2."),
  quote: z
    .string()
    .describe("For a data patch: the words of the source that state the value; else empty."),
});

const checkSchema = z.object({
  chart: z.string().describe("The id of the chart, such as c1."),
  row: z.string().describe("The key of the row."),
  value: z.string().describe("The id of the value checked, such as v2."),
  verdict: z.enum(["holds", "fails", "unclear"]),
  reason: z.string().describe("One sentence."),
});

// A round carries the changes to the text and to the charts: a document without a chart gets
// empty patches and checks.
export const round1Schema = z.object({
  suggestions: z.array(suggestionSchema),
  patches: z.array(patchSchema),
  checks: z.array(checkSchema),
});
export const round2Schema = z.object({
  votes: z.array(voteSchema),
  suggestions: z.array(suggestionSchema),
  patches: z.array(patchSchema),
  checks: z.array(checkSchema),
});
export const round3Schema = z.object({ votes: z.array(voteSchema), checks: z.array(checkSchema) });

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

/** The helper's words for the link of a run (see run-link.ts). */
export const slugSchema = z.object({ words: z.array(z.string()) });

/** The helper's prompt for the picture of a question (see illustrationPrompt). */
export const illustrationSchema = z.object({
  prompt: z.string().min(10).max(2_000).describe("The prompt of the illustration, in English."),
});

/** The helper's one-sentence summary of a completed answer (see tldrPrompt). */
export const tldrSchema = z.object({
  text: z.string().describe("One sentence, at most 25 words."),
});

export const momentsSchema = z.object({
  sentences: z.array(z.string()).describe("At most 3 short sentences."),
});

export const chartMergeSchema = z.object({
  charts: z
    .array(
      z.object({
        question: z.string(),
        dimension: z.string(),
        measure: z.string(),
        briefs: z
          .array(z.string())
          .describe("The ids of the proposed charts that measure this, such as A1 and C2."),
        keys: z
          .array(z.object({ row: z.string(), key: z.string() }))
          .describe("For each row id of those charts, the one label all of them use for that row."),
      }),
    )
    .describe("One entry per measure, the measure most charts share first."),
});

export const chartSpecSchema = z.object({
  spec: z
    .string()
    .describe(
      "The Vega-Lite spec as JSON without data, config, colors or fonts: mark, encoding and transform.",
    ),
  title: z.string(),
  caption: z
    .string()
    .describe("Two or three sentences: what the chart shows, and what is uncertain."),
  after: z.string().describe("The id of the paragraph the chart illustrates best, such as p2."),
});

/** What the renderer returns for each spec of a render call (not a model: see RenderRequest). */
export const renderSchema = z.object({
  results: z.array(
    z.object({
      id: z.string(),
      status: z.enum(["ok", "failed"]),
      error: z.string(),
      svg: z.string(),
      marks: z.string().describe("JSON: the data of the drawn marks, for the checks of the tests."),
    }),
  ),
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
  chart_merge: chartMergeSchema,
  chart_spec: chartSpecSchema,
  render: renderSchema,
} as const satisfies Record<CallKind, z.ZodType>;

export type OutputOf<K extends CallKind> = z.infer<(typeof SCHEMAS)[K]>;
export type SuggestionOutput = z.infer<typeof suggestionSchema>;
export type VoteOutput = z.infer<typeof voteSchema>;
export type PatchOutput = z.infer<typeof patchSchema>;
export type CheckOutput = z.infer<typeof checkSchema>;
export type ChartBriefOutput = z.infer<typeof chartBriefSchema>;

export function schemaFor<K extends CallKind>(kind: K): (typeof SCHEMAS)[K] {
  return SCHEMAS[kind];
}
