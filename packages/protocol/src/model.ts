export const MODELS = ["grok", "claude", "openai", "gemini"] as const; // fixed order: tie-breaks
export type ModelId = (typeof MODELS)[number];

export interface Paragraph {
  kind: "paragraph";
  id: string; // "p3": stable for the whole run, never reused
  text: string;
  support: ModelId[]; // whose draft claims this paragraph carries
  status: "agreed" | "majority" | "contested"; // derived from support, not chosen by a model
  sources: string[]; // Source ids
}
export type Block = Paragraph | Chart; // Chart: phase 4

export interface Snapshot {
  version: number;
  order: string[];
  blocks: Record<string, Block>;
}

export interface Suggestion {
  id: string;
  thread: string;
  author: ModelId;
  coAuthors: ModelId[]; // coAuthors come from merged duplicates
  round: 1 | 2;
  baseVersion: number;
  target: { block: string; layer?: ChartLayer; path?: string };
  op: "replace" | "insert_after" | "delete" | "patch"; // "patch" is for chart layers
  text: string;
  reason: string;
  sources: string[];
}

export interface Thread {
  id: string;
  lockKey: string; // "p3", "p3+grok" for an insertion, "c1/encoding" for a chart layer
  alternatives: string[]; // suggestion ids; "keep" is always a choice
  state: "open" | "accepted" | "rejected" | "unresolved";
  winner?: string;
}

export interface Vote {
  thread: string;
  voter: ModelId;
  round: 2 | 3;
  choice: string; // a suggestion id, or "keep"
  reason: string; // required when the position changed
}

export interface Source {
  id: string;
  url: string;
  title: string;
  quote: string;
  foundBy: ModelId;
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
