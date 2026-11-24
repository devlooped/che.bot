export const MODELS = ["grok", "claude", "openai", "gemini"] as const; // fixed order: tie-breaks
export type ModelId = (typeof MODELS)[number];

/** Who makes a call: one of the four panel models, or the cheap utility model. */
export type Seat = ModelId | "utility";
/** Who executes a call: a seat, or the chart renderer, which is code and no model (the render gate). */
export type CallSeat = Seat | "renderer";

export function isPanel(seat: CallSeat): seat is ModelId {
  return (MODELS as readonly string[]).includes(seat);
}

export type Mode = "quick" | "thorough";

/**
 * Every stage of a run. `quoted`, `awaiting_payment` and `expired` are driven by the
 * server before the protocol starts; the reducer starts at `drafting`.
 */
export type Stage =
  | "quoted"
  | "awaiting_payment"
  | "expired"
  | "drafting"
  | "merging"
  | "round1"
  | "round2"
  | "round3"
  | "editing"
  | "done"
  | "failed";

/** The stages the reducer drives. */
export type RunStage = Exclude<Stage, "quoted" | "awaiting_payment" | "expired">;

/** The concrete models of a run, by role ("panel.grok", "utility", ...), resolved once. */
export type ModelSnapshot = Record<string, { id: string; effort: string | null }>;

export type Confidence = "high" | "medium" | "low";
export type ParagraphStatus = "agreed" | "majority" | "contested";

export interface Paragraph {
  kind: "paragraph";
  id: string; // "p3": stable for the whole run, never reused
  text: string;
  support: ModelId[]; // whose draft claims this paragraph carries (or who accepted its text)
  status: ParagraphStatus; // derived from support, not chosen by a model
  sources: string[]; // Source ids
  claims: string[]; // the draft claims the paragraph carries; empty for text added by a suggestion
}
export type Block = Paragraph | Chart;

export interface Snapshot {
  version: number;
  order: string[];
  blocks: Record<string, Block>;
}

/** A numbered key claim of a draft. `id` is anonymized ("B3"): the merge does not see model names. */
export interface Claim {
  id: string;
  model: ModelId;
  text: string;
  confidence: Confidence;
  sources: string[]; // Source ids
}

/**
 * What a question asks, for its card: to check a claim ("Verdadero", "Falso"...), a yes or a no
 * ("Sí", "No"...), or a fact, a figure or an explanation ("Dato", with no vote).
 */
export type QuestionKind = "claim" | "question" | "fact";

/**
 * A model's answer in one word, the same four codes for a claim and a question: true (Verdadero,
 * Sí), false (Falso, No), depends (Engañoso, Depende) and unknown (Insostenible, No sé).
 */
export type Rating = "true" | "false" | "depends" | "unknown";

/** What a draft says the question is, and its rating; null for a fact. */
export interface DraftVerdict {
  kind: QuestionKind;
  rating: Rating | null;
}

export interface Draft {
  model: ModelId;
  answer: string;
  claims: string[]; // Claim ids, in the draft's order
  /** Absent on drafts written before the verdicts. */
  verdict?: DraftVerdict;
}

export type SuggestionOp = "replace" | "insert_after" | "delete" | "patch"; // "patch" is for chart layers
/** What is wrong with the text: substance only. */
export type SuggestionKind = "wrong" | "missing" | "misleading";

export interface Suggestion {
  id: string;
  thread: string;
  author: ModelId;
  coAuthors: ModelId[]; // coAuthors come from merged duplicates
  round: 1 | 2;
  baseVersion: number;
  target: { block: string; layer?: ChartLayer; path?: string };
  op: SuggestionOp;
  kind: SuggestionKind;
  text: string;
  reason: string;
  sources: string[];
}

export type ThreadState = "open" | "accepted" | "rejected" | "unresolved";

/** Who held what when a thread was resolved: `for` holds the winner (or keep, for a rejection). */
export interface Tally {
  for: ModelId[];
  against: ModelId[];
  none: ModelId[];
}

export interface Thread {
  id: string;
  lockKey: string; // "p3", "p3+grok" for an insertion, "c1/encoding" for a chart layer
  block: string;
  openedRound: 1 | 2;
  alternatives: string[]; // suggestion ids; "keep" is always a choice
  state: ThreadState;
  winner?: string;
  tally?: Tally;
  why?: "two_qualify" | "no_majority"; // set when unresolved
}

export interface Vote {
  thread: string;
  voter: ModelId;
  round: 2 | 3;
  choice: string; // a suggestion id, or "keep"
  reason: string; // required when the position changed
  changed: boolean;
}

export interface Source {
  id: string;
  url: string;
  title: string;
  quote: string;
  /** The model whose search found it first. */
  foundBy: ModelId;
  /** The other models whose search found it too (absent on runs before it was kept). */
  alsoFoundBy?: ModelId[];
}

/**
 * Records in `sources` that `model` found the source `id` too, with a new object (an emitted event
 * may hold the old one). False when the model had already found it.
 */
export function foundAgain(sources: Source[], id: string, model: ModelId): boolean {
  const i = sources.findIndex((s) => s.id === id);
  const s = sources[i];
  if (!s || s.foundBy === model || s.alsoFoundBy?.includes(model)) return false;
  sources[i] = { ...s, alsoFoundBy: [...(s.alsoFoundBy ?? []), model] };
  return true;
}

export type AbstainReason = "timeout" | "invalid" | "refusal" | "error";

export interface Abstention {
  call: string;
  seat: Seat;
  stage: RunStage;
  reason: AbstainReason;
}

/** What the answer must say about how the run went. */
export interface Flags {
  fewDrafts: boolean; // fewer drafts than the quorum: merged what arrived, rounds skipped
  mergeFallback: null | "dropped_claims" | "no_merge"; // the document was completed or built by code
  budgetReached: boolean;
  deadlineReached: boolean;
  quorumLost: boolean; // a round answered by fewer models than the quorum ended the rounds
}

export type CellValue = number | string | null;

/**
 * How a row of a chart was settled: "agreed" (two models or more gave the same value, each with a
 * citation), "single" (one model; its source is checked in the rounds), "disputed" (models gave
 * different values: the alternatives are checked in the rounds), then "held" (exactly one value's
 * source held up), "unverified" (a single value whose source did not hold up: drawn, and marked) or
 * "unsettled" (no single value held up: drawn as a range of the alternatives, with their sources).
 */
export type RowStatus = "agreed" | "single" | "disputed" | "held" | "unverified" | "unsettled";

/** A value of a web row with its citation: the source (found by search) and the words that state it. */
export interface RowValue {
  values: Record<string, CellValue>;
  source: string; // Source id
  quote: string;
  support: ModelId[]; // the models that gave this value
}

export interface Row {
  key: string; // the dimension value of the row ("2026-03", "Córdoba")
  values: Record<string, CellValue>; // { value: 2.7 }
  source: string; // Source id
  quote: string; // the words of the source that state the value
  support: ModelId[];
  status: RowStatus;
  alternatives: RowValue[]; // other values with their sources (a dispute, or an unsettled range)
}

export type ChartLayer = "data" | "transform" | "encoding" | "title" | "caption";
export const CHART_LAYERS: readonly ChartLayer[] = [
  "data",
  "transform",
  "encoding",
  "title",
  "caption",
];

/**
 * A chart block, placed among the paragraphs. Its layers take suggestions and locks separately:
 * `data` (the rows, found on the web and settled by source), `transform` (Vega-Lite transforms),
 * `encoding` (the mark and the encoding), `title` and `caption` (the short explanation). The data
 * never travels in the encoding: `chartSpec` composes the Vega-Lite spec from the layers and the
 * app's fixed theme.
 */
export interface Chart {
  kind: "chart";
  id: string; // "c1", "c2", "c3"
  brief: { question: string; measures: string[]; dimensions: string[] };
  /** The fields of the data are `key` (the dimension) and `value` (the one measure). */
  data: { rows: Row[] };
  transform: unknown[];
  encoding: Record<string, unknown>;
  mark: string;
  title: string;
  caption: string;
}

/** Display names, for the moments and the answer. */
export const MODEL_NAMES: Record<ModelId, string> = {
  grok: "Grok",
  claude: "Claude",
  openai: "ChatGPT",
  gemini: "Gemini",
};

/** The four models in the order the interface lists them: alphabetical by display name. */
export const MODELS_BY_NAME: readonly ModelId[] = [...MODELS].sort((a, b) =>
  MODEL_NAMES[a].localeCompare(MODEL_NAMES[b]),
);
