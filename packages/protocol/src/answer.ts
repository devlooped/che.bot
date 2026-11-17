import { chartSpec } from "./chart.ts";
import { type ChartRender, confirmersOf, type Dispute, holdsOf } from "./chart-run.ts";
import {
  type Abstention,
  type CellValue,
  type Chart,
  type Flags,
  MODELS,
  type ModelId,
  type ParagraphStatus,
  type RowStatus,
  type Snapshot,
  type Source,
  type Suggestion,
  type Thread,
} from "./model.ts";
import { byNumericId, clone } from "./util.ts";

/** What the answer selector reads: both the run state and the replayed view provide it. */
export interface AnswerInput {
  status: string;
  snapshots: readonly Snapshot[];
  threads: Readonly<Record<string, Thread>>;
  suggestions: Readonly<Record<string, Suggestion>>;
  positions: Readonly<Record<string, Partial<Record<ModelId, string>>>>;
  sources: readonly Source[];
  flags: Flags;
  abstentions: readonly Abstention[];
}

export interface AnswerParagraph {
  id: string;
  text: string;
  status: ParagraphStatus;
  support: ModelId[];
  tally: { for: number; of: number }; // "3 de 4" is { for: 3, of: 4 }
  sources: string[];
}

/** A suggestion still open, or unresolved at the end: shown as a dissent note in the margin. */
export interface DissentNote {
  thread: string;
  block: string;
  state: "open" | "unresolved";
  suggestion: string;
  author: ModelId;
  coAuthors: ModelId[];
  op: Suggestion["op"];
  text: string;
  reason: string;
  holders: ModelId[]; // the models that hold this suggestion
}

export interface Answer {
  version: number;
  final: boolean; // the run completed and this is its last version
  text: string;
  paragraphs: AnswerParagraph[];
  dissent: DissentNote[];
  sources: Source[]; // the sources cited by the paragraphs, by id
  flags: Flags;
  abstained: {
    model: ModelId;
    call: string;
    stage: Abstention["stage"];
    reason: Abstention["reason"];
  }[];
}

/**
 * What a UI or the CLI prints for a run, at its latest version or at `version` (the history
 * slider). Dissent notes, flags and abstentions describe the run as it stands. Null before the
 * document exists or for an unknown version.
 */
export function selectAnswer(input: AnswerInput, version?: number): Answer | null {
  const last = input.snapshots.at(-1);
  const snapshot =
    version === undefined ? last : input.snapshots.find((s) => s.version === version);
  if (!snapshot || !last) return null;
  const paragraphs: AnswerParagraph[] = [];
  for (const id of snapshot.order) {
    const b = snapshot.blocks[id];
    if (b?.kind !== "paragraph") continue;
    paragraphs.push({
      id,
      text: b.text,
      status: b.status,
      support: [...b.support],
      tally: { for: b.support.length, of: MODELS.length },
      sources: [...b.sources],
    });
  }
  const cited = new Set(paragraphs.flatMap((p) => p.sources));
  const dissent: DissentNote[] = [];
  const threads = Object.values(input.threads)
    .filter((t) => t.state === "open" || t.state === "unresolved")
    .sort((a, b) => byNumericId(a.id, b.id));
  for (const t of threads) {
    const positions = input.positions[t.id] ?? {};
    for (const id of t.alternatives) {
      const s = input.suggestions[id];
      if (!s) continue;
      dissent.push({
        thread: t.id,
        block: t.block,
        state: t.state as "open" | "unresolved",
        suggestion: id,
        author: s.author,
        coAuthors: [...s.coAuthors],
        op: s.op,
        text: s.text,
        reason: s.reason,
        holders: MODELS.filter((m) => positions[m] === id),
      });
    }
  }
  return {
    version: snapshot.version,
    final: input.status === "completed" && snapshot.version === last.version,
    text: paragraphs.map((p) => p.text).join("\n\n"),
    paragraphs,
    dissent,
    sources: input.sources.filter((s) => cited.has(s.id)).sort((a, b) => byNumericId(a.id, b.id)),
    flags: { ...input.flags },
    abstained: input.abstentions.flatMap((a) =>
      a.seat === "utility"
        ? []
        : [{ model: a.seat, call: a.call, stage: a.stage, reason: a.reason }],
    ),
  };
}

// ---------------------------------------------------------------------------------------------
// Charts

/** What the chart selector reads: the run state and the replayed view both provide it. */
export interface ChartAnswerInput extends AnswerInput {
  disputes: Readonly<Record<string, Dispute>>;
  renders: readonly ChartRender[];
}

export interface ChartAnswerValue {
  value: number | null;
  source: Source | null;
  quote: string;
  support: ModelId[];
}

export interface ChartAnswerRow {
  key: string;
  status: RowStatus;
  values: Record<string, CellValue>; // { value }
  /** The source of the value drawn. */
  source: Source | null;
  quote: string;
  support: ModelId[];
  /** The other values with their sources: the ends of a range when the row is unsettled. */
  alternatives: ChartAnswerValue[];
  /** The dispute of the row that the sources settled (or did not), with each value's checks. */
  dispute: ChartDisputeNote | null;
}

export interface ChartDisputeNote {
  id: string;
  state: Dispute["state"];
  winner: string | null;
  values: (ChartAnswerValue & {
    id: string;
    stated: boolean;
    holds: number;
    checkers: number;
    /** The models that checked the value's source and said it holds. */
    confirmedBy: ModelId[];
  })[];
}

export interface ChartAnswer {
  version: number;
  final: boolean;
  block: string;
  brief: Chart["brief"];
  title: string;
  caption: string;
  /** The full Vega-Lite spec of this version: data, layers and the app's theme (`chartSpec`). */
  spec: Record<string, unknown>;
  rows: ChartAnswerRow[];
  /** Rows whose value stays in dispute (open, or unsettled and drawn as a range). */
  disputed: ChartAnswerRow[];
  /** Patches still open, or unresolved at the end: dissent notes on the layers. */
  dissent: DissentNote[];
  /** The render of this version: the call and result whose SVG the ledger keeps. */
  render: ChartRender | null;
  sources: Source[];
  flags: Flags;
  abstained: Answer["abstained"];
}

/**
 * The chart `block` of a run, at its latest version or at `version`, with its data, the source of
 * every row, its disputes and the open disagreements on its layers. Null before the chart exists,
 * for an unknown version, or for a block that is not a chart.
 */
export function selectChart(
  input: ChartAnswerInput,
  block: string,
  version?: number,
): ChartAnswer | null {
  const last = input.snapshots.at(-1);
  const snapshot =
    version === undefined ? last : input.snapshots.find((s) => s.version === version);
  if (!snapshot || !last) return null;
  const chart = snapshot.blocks[block];
  if (chart?.kind !== "chart") return null;
  const source = (id: string) => input.sources.find((s) => s.id === id) ?? null;
  const disputes = Object.values(input.disputes).sort((a, b) => byNumericId(a.id, b.id));
  const value = (v: {
    values: Record<string, CellValue>;
    source: string;
    quote: string;
    support: ModelId[];
  }): ChartAnswerValue => ({
    value: typeof v.values.value === "number" ? v.values.value : null,
    source: source(v.source),
    quote: v.quote,
    support: [...v.support],
  });
  const rows: ChartAnswerRow[] = chart.data.rows.map((r) => {
    const d = disputes.findLast((x) => x.block === chart.id && x.row === r.key);
    return {
      key: r.key,
      status: r.status,
      values: { ...r.values },
      source: source(r.source),
      quote: r.quote,
      support: [...r.support],
      alternatives: r.alternatives.map(value),
      dispute: d
        ? {
            id: d.id,
            state: d.state,
            winner: d.winner,
            values: d.values.map((v) => ({
              id: v.id,
              value: v.value,
              source: source(v.source),
              quote: v.quote,
              support: [...v.support],
              stated: v.stated,
              ...holdsOf(d, v),
              confirmedBy: confirmersOf(d, v),
            })),
          }
        : null,
    };
  });
  const cited = new Set(
    chart.data.rows.flatMap((r) => [r.source, ...r.alternatives.map((a) => a.source)]),
  );
  const prose = selectAnswer(input, snapshot.version);
  return {
    version: snapshot.version,
    final: input.status === "completed" && snapshot.version === last.version,
    block: chart.id,
    brief: clone(chart.brief),
    title: chart.title,
    caption: chart.caption,
    spec: chartSpec(chart),
    rows,
    disputed: rows.filter(
      (r) => r.status === "disputed" || r.status === "unsettled" || r.dispute?.state === "open",
    ),
    dissent: (prose?.dissent ?? []).filter((d) => d.block === chart.id),
    render:
      input.renders.findLast((r) => r.block === chart.id && r.version === snapshot.version) ?? null,
    sources: input.sources.filter((s) => cited.has(s.id)).sort((a, b) => byNumericId(a.id, b.id)),
    flags: { ...input.flags },
    abstained: prose?.abstained ?? [],
  };
}
