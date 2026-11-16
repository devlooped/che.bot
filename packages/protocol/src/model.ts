export const MODELS = ["grok", "claude", "openai", "gemini"] as const; // fixed order: tie-breaks
export type ModelId = (typeof MODELS)[number];

/** Who makes a call: one of the four panel models, or the cheap utility model. */
export type Seat = ModelId | "utility";

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
export type Block = Paragraph | Chart; // Chart: phase 4

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

export interface Draft {
  model: ModelId;
  answer: string;
  claims: string[]; // Claim ids, in the draft's order
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
  foundBy: ModelId;
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

export interface Row {
  key: string;
  values: Record<string, number | string | null>;
  source: string;
  alternatives: { values: Record<string, number | string | null>; source: string }[];
}

export type ChartLayer = "data" | "transform" | "encoding" | "title" | "caption";

export interface Chart {
  kind: "chart";
  id: string;
  brief: { question: string; measures: string[]; dimensions: string[] };
  data: { origin: "user" | "web"; rows: Row[] };
  transform: unknown[];
  encoding: object;
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
