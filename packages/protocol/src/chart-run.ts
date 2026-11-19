import {
  chartSpec,
  checkPatch,
  decimals,
  defaultLayers,
  layersFromSpec,
  type PatchDropReason,
  patchChart,
  quoteStates,
  readModelNumber,
  readValue,
  sameValue,
  temporalKeys,
} from "./chart.ts";
import type { RunEvent } from "./events.ts";
import {
  CHART_LAYERS,
  type Chart,
  type ChartLayer,
  MODELS,
  type ModelId,
  type Row,
  type RowStatus,
  type Snapshot,
} from "./model.ts";
import {
  chartMergePrompt,
  chartSpecPrompt,
  type DisputeView,
  type MergeBrief,
} from "./prompts/chart.ts";
import type { Call, RunState } from "./reducer.ts";
import type { ChartBriefOutput, OutputOf, PatchOutput } from "./schemas.ts";
import type { Candidate } from "./threads.ts";
import { normalizeUrl } from "./urls.ts";
import { byModelOrder, clone, hash, isOneSentence, normalizeText, uniqueSorted } from "./util.ts";

// The charts of a run. Data first, design second:
//   drafting  draft:0:<model>         each draft may propose up to 3 charts, every value with its
//                                     citation, found by the search of that call
//   merging   chart-merge:0           beside the merge of the text: the utility model groups the
//                                     proposals by measure and aligns the labels of their rows; code
//                                     compares the values. A measure two drafts or more proposed
//                                     becomes a chart (c1, c2, c3); the others are declined
//             spec:<chart>:<writer>   one model per chart writes its Vega-Lite spec and places it
//             render:seed             the render gate on every writer's spec and on the plain one
//   round1-3  round:<n>:<model>       patches on the layers and checks of the sources of the rows,
//                                     in the same call as the suggestions on the text
//             render:gate:<n>         every patch is rendered before it reaches a vote
//             render:v<n>             every chart a new version changed is rendered (its SVG)
// A chart has no editor pass: its caption is a layer, settled in the rounds like the others.

/** The limits of the charts of a run. */
export const CHART_LIMITS = { charts: 3, rowsPerBrief: 24, rows: 40 };

export interface BriefRow {
  id: string; // "A1.3": the brief and the row number, anonymized
  key: string;
  value: number;
  source: string; // Source id
  quote: string;
  /** Code: the quote (or the search excerpt of the source) states the value. */
  stated: boolean;
}

export type BriefRowDrop =
  | "no_citation"
  | "not_a_number"
  | "over_cap"
  | "duplicate_key"
  | "empty_key";

/** A chart a draft proposed: one measure along one dimension, every value with its citation. */
export interface ChartBrief {
  id: string; // "A1": the letter of the draft (anonymized) and the number of the chart in it
  model: ModelId;
  question: string;
  dimension: string;
  measure: string;
  mark: string;
  rows: BriefRow[];
  dropped: { key: string; why: BriefRowDrop }[];
}

/** Why a measure the drafts proposed is not drawn: one draft only, or beyond the cap of charts. */
export type DeclineReason = "one_draft" | "over_cap";

export type Verdict = "holds" | "fails" | "unclear";

export interface DisputeValue {
  id: string; // "v1"
  value: number;
  source: string;
  quote: string;
  support: ModelId[];
  stated: boolean;
}

/**
 * A row whose value the sources settle: a value given by one model only, or different values for
 * one row. Every model checks the sources of the values it did not give, in the round after the
 * dispute opened; the dispute is settled at that round's boundary (see `settleDisputes`).
 */
export interface Dispute {
  id: string; // "d1": unique in the run, whatever the chart
  block: string;
  row: string;
  lockKey: string; // "c1/data/2026-03"
  openedRound: 0 | 1 | 2 | 3;
  values: DisputeValue[];
  checks: Record<string, Partial<Record<ModelId, Verdict>>>; // by value id
  state: "open" | "held" | "unverified" | "unsettled" | "unchecked";
  winner: string | null;
}

export interface ChartRender {
  version: number;
  block: string;
  /** The render call whose result holds the SVG (in the ledger), and the id of the result. */
  call: string;
  result: string;
  ok: boolean;
  error: string | null;
}

export interface DroppedPatch {
  round: 1 | 2;
  model: ModelId;
  index: number;
  block: string;
  layer: ChartLayer;
  path: string;
  why:
    | PatchDropReason
    | DropReasonOfData
    | "over_cap"
    | "style"
    | "reason_not_one_sentence"
    | "unknown_chart";
  detail: string;
}

export type DropReasonOfData =
  | "unknown_source"
  | "not_stated"
  | "not_a_number"
  | "row_in_dispute"
  | "same_layer";

export interface ChartLayers {
  mark: string;
  encoding: Record<string, unknown>;
  transform: unknown[];
  title: string;
  caption: string;
}

/** One chart of the answer while it is written: the merged data, its writer and its place. */
export interface ChartPlan {
  id: string; // "c1"
  /** The briefs whose rows it draws. */
  briefs: string[];
  writer: ModelId | null;
  /** The chart agreed by the merge, before the spec: data, brief, a plain encoding. */
  base: Chart;
  /** The paragraph it follows, as its writer placed it; null: after the first paragraph. */
  after: string | null;
  /** The two candidates of the seed render: the writer's layers and the plain ones of code. */
  seed: {
    writer: ChartLayers | null;
    plain: ChartLayers;
    why: string | null;
    stripped: string[];
  } | null;
}

export interface ChartsState {
  /** Every chart the drafts proposed, in model order. */
  briefs: ChartBrief[];
  /** The charts of the answer by block id (c1, c2, c3): empty when the answer has none. */
  plans: Record<string, ChartPlan>;
  disputes: Record<string, Dispute>;
  renders: ChartRender[];
  dropped: DroppedPatch[];
  /** Versions made to undo a version that did not render: one of them is never undone again. */
  reverts: number[];
  counters: { dispute: number };
}

/** A data patch that passed its checks: a new value for a row, with its citation. */
export interface DataCandidate {
  model: ModelId;
  block: string;
  row: string;
  value: number;
  source: string;
  quote: string;
  reason: string;
}

export function createChartsState(): ChartsState {
  return {
    briefs: [],
    plans: {},
    disputes: {},
    renders: [],
    dropped: [],
    reverts: [],
    counters: { dispute: 0 },
  };
}

/** The ids of the charts of the answer, in order. */
export function chartIds(state: RunState): string[] {
  return Object.keys(state.charts.plans).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
}

export function hasCharts(state: RunState): boolean {
  return chartIds(state).length > 0;
}

/** The helpers of the reducer the charts use (passed in, so that the modules stay acyclic). */
export interface StepKit {
  call(
    state: RunState,
    key: string,
    seat: Call["seat"],
    kind: Call["kind"],
    prompt: { system: string; prompt: string },
    search?: { maxResults: number },
  ): Call;
}

function chartIn(snapshot: Snapshot | undefined, block: string): Chart | null {
  const b = snapshot?.blocks[block];
  return b?.kind === "chart" ? b : null;
}

/** The charts of a version, in the order of the document. */
export function chartsOf(snapshot: Snapshot): Chart[] {
  return snapshot.order.flatMap((id) => {
    const b = snapshot.blocks[id];
    return b?.kind === "chart" ? [b] : [];
  });
}

// ---------------------------------------------------------------------------------------------
// Drafting: the charts each draft proposes

/**
 * The charts of one draft. A row counts only if the search of that call returned its source
 * (`found`: normalized URL → the excerpt of the search); its source id is the run's (`urls`).
 */
export function readBriefs(input: {
  model: ModelId;
  label: string;
  charts: readonly ChartBriefOutput[];
  found: ReadonlyMap<string, string>;
  urls: ReadonlyMap<string, string>;
}): ChartBrief[] {
  const briefs: ChartBrief[] = [];
  for (const o of input.charts.slice(0, CHART_LIMITS.charts)) {
    const id = `${input.label}${briefs.length + 1}`;
    const rows: BriefRow[] = [];
    const dropped: ChartBrief["dropped"] = [];
    const keys = new Set<string>();
    for (const [i, r] of o.rows.entries()) {
      const key = r.key.trim();
      const drop = (why: BriefRowDrop) => dropped.push({ key, why });
      if (i >= CHART_LIMITS.rowsPerBrief) {
        drop("over_cap");
        continue;
      }
      if (key === "") {
        drop("empty_key");
        continue;
      }
      const value = readModelNumber(r.value);
      if (value === null) {
        drop("not_a_number");
        continue;
      }
      const url = normalizeUrl(r.source.trim());
      const source = url ? input.urls.get(url) : undefined;
      if (!url || !input.found.has(url) || !source) {
        drop("no_citation");
        continue;
      }
      const canonical = normalizeKey(key);
      if (keys.has(canonical)) {
        drop("duplicate_key");
        continue;
      }
      keys.add(canonical);
      const quote = r.quote.trim();
      rows.push({
        id: `${id}.${rows.length + 1}`,
        key,
        value,
        source,
        quote,
        stated: quoteStates(value, quote) || quoteStates(value, input.found.get(url) ?? ""),
      });
    }
    briefs.push({
      id,
      model: input.model,
      question: o.question.trim(),
      dimension: o.dimension.trim(),
      measure: o.measure.trim(),
      mark: o.mark,
      rows,
      dropped,
    });
  }
  return briefs;
}

/** The briefs with data: the only ones a chart can come from. */
function briefsWithRows(state: RunState): ChartBrief[] {
  return state.charts.briefs.filter((b) => b.rows.length > 0);
}

/** Whether the merge groups the proposed charts: at least 2 drafts proposed one with data. */
export function chartsProposed(state: RunState): boolean {
  return new Set(briefsWithRows(state).map((b) => b.model)).size >= 2;
}

/** The charts of a single draft, which no other draft can agree on: declined after the drafts. */
export function declineLoneBriefs(run: RunState, events: RunEvent[]) {
  if (chartsProposed(run)) return;
  for (const b of briefsWithRows(run))
    decline(run, events, { measure: b.measure, briefs: [b.id], models: [b.model] }, "one_draft");
}

function decline(
  run: RunState,
  events: RunEvent[],
  group: { measure: string; briefs: string[]; models: ModelId[] },
  why: DeclineReason,
) {
  events.push({
    key: `chart.declined:${group.briefs.join("+")}`,
    batch: run.batch,
    type: "chart.declined",
    measure: group.measure,
    briefs: [...group.briefs],
    models: uniqueSorted(group.models, byModelOrder),
    why,
  });
}

/** The code's notion of the same row label: lower case, no accents, collapsed whitespace. */
export function normalizeKey(key: string): string {
  return normalizeText(key.normalize("NFD").replace(/\p{M}/gu, ""));
}

// ---------------------------------------------------------------------------------------------
// Merging: groups and labels by the utility model, everything else by code

export function chartMergeCall(state: RunState, kit: StepKit): Call {
  const briefs: MergeBrief[] = briefsWithRows(state)
    .map((b) => ({
      id: b.id,
      question: b.question,
      dimension: b.dimension,
      measure: b.measure,
      rows: b.rows.map((r) => ({ id: r.id, key: r.key })),
    }))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  return kit.call(
    state,
    "chart-merge:0",
    "utility",
    "chart_merge",
    chartMergePrompt({ question: state.question, briefs }),
  );
}

function majority<T>(
  items: readonly { model: ModelId; value: T }[],
  key: (v: T) => string,
): T | undefined {
  const counts = new Map<string, { n: number; first: number; value: T }>();
  for (const it of items) {
    const k = key(it.value);
    const c = counts.get(k);
    const order = MODELS.indexOf(it.model);
    if (c) {
      c.n++;
      c.first = Math.min(c.first, order);
    } else counts.set(k, { n: 1, first: order, value: it.value });
  }
  return [...counts.values()].sort((a, b) => b.n - a.n || a.first - b.first)[0]?.value;
}

interface Group {
  question: string;
  dimension: string;
  measure: string;
  briefs: ChartBrief[];
  keys: Map<string, string>; // row id → the aligned label
  order: number;
}

/**
 * The groups of the proposed charts: the utility model's (a brief in one group only, the first
 * that names it), or one group per measure written the same way when it gave none. A brief in no
 * group is a group of its own. A draft counts once per group: its first brief there.
 */
function groupsOf(run: RunState, merge: OutputOf<"chart_merge"> | undefined): Group[] {
  const briefs = briefsWithRows(run);
  const byId = new Map(briefs.map((b) => [b.id, b]));
  const placed = new Set<string>();
  const groups: Group[] = [];
  const add = (g: Omit<Group, "order" | "briefs">, ids: readonly string[]) => {
    const list: ChartBrief[] = [];
    for (const raw of ids) {
      const b = byId.get(raw.trim());
      if (!b || placed.has(b.id) || list.some((x) => x.model === b.model)) continue;
      placed.add(b.id);
      list.push(b);
    }
    if (list.length > 0) groups.push({ ...g, briefs: list, order: groups.length });
  };
  for (const c of merge?.charts ?? []) {
    const keys = new Map<string, string>();
    for (const k of c.keys) if (!keys.has(k.row.trim())) keys.set(k.row.trim(), k.key.trim());
    add(
      {
        question: c.question.trim(),
        dimension: c.dimension.trim(),
        measure: c.measure.trim(),
        keys,
      },
      c.briefs,
    );
  }
  for (const b of briefs) {
    if (placed.has(b.id)) continue;
    // without the utility model, the briefs of one measure written the same way go together
    const same = merge
      ? [b]
      : briefs.filter(
          (x) => !placed.has(x.id) && normalizeKey(x.measure) === normalizeKey(b.measure),
        );
    add(
      { question: b.question, dimension: b.dimension, measure: b.measure, keys: new Map() },
      same.map((x) => x.id),
    );
  }
  return groups;
}

/**
 * The charts of the answer. Each group of two drafts or more is a chart, the most supported first,
 * at most `CHART_LIMITS.charts`; the others are declined. In a chart, rows are matched by label (the
 * utility model's alignment, or the normalized label when it gave none); values of one row from
 * several models are compared by code (`sameValue`): the same value from two models is support,
 * different values are kept as alternatives and open a dispute, and a value from one model opens
 * one too (its source is checked).
 */
export function reduceChartMerge(
  run: RunState,
  merge: OutputOf<"chart_merge"> | undefined,
  events: RunEvent[],
) {
  const groups = groupsOf(run, merge);
  const qualifying = groups
    .filter((g) => g.briefs.length >= 2)
    .sort((a, b) => b.briefs.length - a.briefs.length || a.order - b.order);
  const kept = qualifying.slice(0, CHART_LIMITS.charts);
  for (const g of groups) {
    if (kept.includes(g)) continue;
    decline(
      run,
      events,
      {
        measure: g.measure,
        briefs: g.briefs.map((b) => b.id),
        models: g.briefs.map((b) => b.model),
      },
      g.briefs.length >= 2 ? "over_cap" : "one_draft",
    );
  }
  kept.forEach((g, i) => {
    const id = `c${i + 1}`;
    const base = baseChart(run, id, g, events);
    run.charts.plans[id] = {
      id,
      briefs: g.briefs.map((b) => b.id),
      writer: null,
      base,
      after: null,
      seed: null,
    };
  });
  chooseWriters(run);
}

function baseChart(run: RunState, id: string, g: Group, events: RunEvent[]): Chart {
  const rowsByLabel = new Map<
    string,
    { label: string; order: number; entries: { model: ModelId; row: BriefRow }[] }
  >();
  let order = 0;
  for (const b of g.briefs) {
    for (const r of b.rows) {
      const lbl = g.keys.get(r.id) || r.key;
      const k = normalizeKey(lbl);
      let entry = rowsByLabel.get(k);
      if (!entry) {
        entry = { label: lbl, order: order++, entries: [] };
        rowsByLabel.set(k, entry);
      }
      if (!entry.entries.some((e) => e.model === b.model))
        entry.entries.push({ model: b.model, row: r });
    }
  }
  let list = [...rowsByLabel.values()];
  const rowOf = (e: (typeof list)[number]) => buildRow(e.label, e.entries);
  let rows = list.map(rowOf);
  if (temporalKeys(rows)) {
    list = list.sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
    rows = list.map(rowOf);
  }
  rows = rows.slice(0, CHART_LIMITS.rows);
  const pick = (field: (b: ChartBrief) => string) =>
    majority(
      g.briefs.map((b) => ({ model: b.model, value: field(b) })),
      normalizeText,
    ) ?? "";
  const mark =
    majority(
      g.briefs.map((b) => ({ model: b.model, value: b.mark })),
      (v) => v,
    ) ?? "bar";
  const base: Chart = {
    kind: "chart",
    id,
    brief: {
      question: g.question || pick((b) => b.question) || run.question,
      measures: [g.measure || pick((b) => b.measure)],
      dimensions: [g.dimension || pick((b) => b.dimension)],
    },
    data: { rows },
    transform: [],
    encoding: {},
    mark,
    title: "",
    caption: "",
  };
  base.encoding = defaultLayers(base, mark).encoding;
  for (const row of rows) {
    if (row.status !== "single" && row.status !== "disputed") continue;
    const dispute = openDispute(run, id, row, 0);
    events.push({
      key: `dispute.opened:${dispute.id}`,
      batch: run.batch,
      type: "dispute.opened",
      dispute: clone(dispute),
    });
  }
  return base;
}

/**
 * Groups the items whose values are the same (`sameValue`). "The same by rounding" is not
 * transitive (76 is the same as 75.848 and as 76.02, which differ), so the finer values are placed
 * first, each a group of its own unless it is the same as one already placed, and a value joins
 * the group whose value is closest among those it is the same as: the groups do not depend on the
 * order of the items, but for a value as close to two groups. That order still gives the order of
 * the items in a group and of the new groups (by their first item), after the `seeds`: groups of
 * values already kept, which items may join but never merge.
 */
export function groupSame<T>(
  items: readonly T[],
  numberOf: (item: T) => number,
  seeds: readonly number[] = [],
): { value: number; items: T[] }[] {
  const groups: { value: number; at: number[] }[] = seeds.map((value) => ({ value, at: [] }));
  const finerFirst = items
    .map((_, i) => i)
    .sort((a, b) => decimals(numberOf(items[b] as T)) - decimals(numberOf(items[a] as T)) || a - b);
  for (const i of finerFirst) {
    const v = numberOf(items[i] as T);
    let best: (typeof groups)[number] | undefined;
    for (const g of groups)
      if (sameValue(g.value, v) && (!best || Math.abs(g.value - v) < Math.abs(best.value - v)))
        best = g;
    if (best) best.at.push(i);
    else groups.push({ value: v, at: [i] });
  }
  for (const g of groups) g.at.sort((a, b) => a - b);
  const fresh = groups.slice(seeds.length).sort((a, b) => (a.at[0] ?? 0) - (b.at[0] ?? 0));
  return [...groups.slice(0, seeds.length), ...fresh].map((g) => ({
    value: g.value,
    items: g.at.map((i) => items[i] as T),
  }));
}

function buildRow(label: string, entries: readonly { model: ModelId; row: BriefRow }[]): Row {
  const clusters = groupSame(
    [...entries].sort((a, b) => byModelOrder(a.model, b.model)),
    (e) => e.row.value,
  ).map((g) => ({ entries: g.items }));
  clusters.sort((a, b) => b.entries.length - a.entries.length);
  const toValue = (c: (typeof clusters)[number]) => {
    const first =
      c.entries.find((e) => e.row.stated) ?? (c.entries[0] as { model: ModelId; row: BriefRow });
    return {
      values: { value: first.row.value },
      source: first.row.source,
      quote: first.row.quote,
      support: uniqueSorted(
        c.entries.map((e) => e.model),
        byModelOrder,
      ),
    };
  };
  const [main, ...rest] = clusters.map(toValue);
  const status: RowStatus =
    rest.length > 0 ? "disputed" : (main?.support.length ?? 0) >= 2 ? "agreed" : "single";
  return {
    key: label,
    values: main?.values ?? { value: null },
    source: main?.source ?? "",
    quote: main?.quote ?? "",
    support: main?.support ?? [],
    status,
    alternatives: rest,
  };
}

function openDispute(
  run: RunState,
  block: string,
  row: Row,
  round: Dispute["openedRound"],
): Dispute {
  const id = `d${++run.charts.counters.dispute}`;
  const values: DisputeValue[] = [row, ...row.alternatives].map((v, i) => ({
    id: `v${i + 1}`,
    value: v.values.value as number,
    source: v.source,
    quote: v.quote,
    support: [...v.support],
    stated: stated(run, v.values.value as number, v.quote, v.source),
  }));
  const dispute: Dispute = {
    id,
    block,
    row: row.key,
    lockKey: `${block}/data/${row.key}`,
    openedRound: round,
    values,
    checks: {},
    state: "open",
    winner: null,
  };
  run.charts.disputes[id] = dispute;
  return dispute;
}

function stated(run: RunState, value: number, quote: string, source: string): boolean {
  const excerpt = run.sources.find((s) => s.id === source)?.quote ?? "";
  return quoteStates(value, quote) || quoteStates(value, excerpt);
}

/**
 * The writer of each chart's spec, chosen like the editor: among the models whose brief the chart
 * draws, the one that gave the most of its agreed values, ties by a rotation seeded by the run id.
 * A model writes one spec while another model of the chart is free.
 */
export function chooseWriters(run: RunState) {
  const start = hash(run.id) % MODELS.length;
  const rotation = [...MODELS.slice(start), ...MODELS.slice(0, start)];
  const busy = new Set<ModelId>();
  for (const id of chartIds(run)) {
    const plan = run.charts.plans[id] as ChartPlan;
    const briefed = new Set(
      run.charts.briefs.filter((b) => plan.briefs.includes(b.id)).map((b) => b.model),
    );
    const score = (m: ModelId) => plan.base.data.rows.filter((r) => r.support.includes(m)).length;
    const pickFrom = (free: boolean) => {
      let best: ModelId | null = null;
      for (const m of rotation)
        if (briefed.has(m) && (!free || !busy.has(m)) && (best === null || score(m) > score(best)))
          best = m;
      return best;
    };
    plan.writer = pickFrom(true) ?? pickFrom(false);
    if (plan.writer) busy.add(plan.writer);
  }
}

// ---------------------------------------------------------------------------------------------
// The specs and the seed render

export function specCalls(state: RunState, kit: StepKit, affordable: boolean): Call[] {
  if (!affordable) return [];
  const document = state.snapshots[0];
  return chartIds(state).flatMap((id) => {
    const plan = state.charts.plans[id] as ChartPlan;
    if (!plan.writer || !document) return [];
    return [
      kit.call(
        state,
        `spec:${id}:${plan.writer}`,
        plan.writer,
        "chart_spec",
        chartSpecPrompt({ question: state.question, chart: plan.base, document }),
      ),
    ];
  });
}

export function reduceSpec(run: RunState, outputs: Map<string, Output>) {
  const document = run.snapshots[0];
  for (const id of chartIds(run)) {
    const plan = run.charts.plans[id] as ChartPlan;
    const base = plan.base;
    const out = plan.writer
      ? (outputs.get(`spec:${id}:${plan.writer}`)?.output as OutputOf<"chart_spec"> | undefined)
      : undefined;
    const title = out?.title.trim().slice(0, 120) || base.brief.question;
    const caption = out?.caption.trim().slice(0, 600) ?? "";
    const plain: ChartLayers = {
      mark: base.mark,
      encoding: clone(base.encoding),
      transform: [],
      title,
      caption,
    };
    let writer: ChartLayers | null = null;
    let why: string | null = out ? null : "no spec";
    let stripped: string[] = [];
    if (out) {
      const layers = layersFromSpec(out.spec);
      if (layers.ok) {
        writer = {
          mark: layers.mark,
          encoding: layers.encoding,
          transform: layers.transform,
          title,
          caption,
        };
        stripped = layers.stripped;
      } else why = `${layers.why}: ${layers.detail}`;
    }
    const after = out?.after.trim() ?? "";
    plan.after = document?.blocks[after]?.kind === "paragraph" ? after : null;
    plan.seed = { writer, plain, why, stripped };
  }
  run.next = { phase: "seed" };
}

export function withLayers(chart: Chart, layers: ChartLayers): Chart {
  return { ...clone(chart), ...clone(layers) };
}

export function seedRenderCall(state: RunState, kit: StepKit): Call {
  const specs = chartIds(state).flatMap((id) => {
    const plan = state.charts.plans[id] as ChartPlan;
    const seed = plan.seed as NonNullable<ChartPlan["seed"]>;
    return [
      ...(seed.writer
        ? [{ id: `${id}:writer`, spec: chartSpec(withLayers(plan.base, seed.writer)) }]
        : []),
      { id: `${id}:plain`, spec: chartSpec(withLayers(plan.base, seed.plain)) },
    ];
  });
  return renderCall(state, kit, "render:seed", specs);
}

export function renderCall(
  state: RunState,
  kit: StepKit,
  key: string,
  specs: { id: string; spec: Record<string, unknown> }[],
): Call {
  const c = kit.call(state, key, "renderer", "render", { system: "", prompt: "" });
  c.render = { specs };
  return c;
}

interface Output {
  call: Call;
  output: unknown;
}

type RenderResults = Map<string, { ok: boolean; error: string }>;

function renderResults(outputs: Map<string, Output>, key: string): RenderResults {
  const out = outputs.get(key)?.output as OutputOf<"render"> | undefined;
  const results: RenderResults = new Map();
  for (const r of out?.results ?? []) {
    if (!results.has(r.id)) results.set(r.id, { ok: r.status === "ok", error: r.error });
  }
  return results;
}

/**
 * Seeds the document: the paragraphs of the merge with each chart after the paragraph its writer
 * named (after the first paragraph when it named none). A chart is the writer's if it renders,
 * else the plain one of code; its render is version 1's.
 */
export function reduceSeedRender(run: RunState, outputs: Map<string, Output>, events: RunEvent[]) {
  const prose = run.snapshots[0] ?? { version: 1, order: [], blocks: {} };
  const results = renderResults(outputs, "render:seed");
  const ids = chartIds(run);
  const blocks: Snapshot["blocks"] = { ...prose.blocks };
  const used: Record<string, "writer" | "plain"> = {};
  for (const id of ids) {
    const plan = run.charts.plans[id] as ChartPlan;
    const seed = plan.seed as NonNullable<ChartPlan["seed"]>;
    const writerOk = seed.writer !== null && results.get(`${id}:writer`)?.ok === true;
    used[id] = writerOk ? "writer" : "plain";
    blocks[id] = withLayers(plan.base, writerOk ? (seed.writer as ChartLayers) : seed.plain);
    const why =
      seed.writer && !writerOk
        ? `render_failed: ${results.get(`${id}:writer`)?.error || "no render"}`
        : seed.why;
    events.push({
      key: `chart.written:${id}`,
      batch: run.batch,
      type: "chart.written",
      block: id,
      writer: plan.writer,
      used: used[id],
      why: why ?? null,
      stripped: seed.stripped,
    });
  }
  const first = prose.order[0] ?? null;
  const placeOf = (id: string) => run.charts.plans[id]?.after ?? first;
  const order: string[] = ids.filter((id) => placeOf(id) === null);
  for (const p of prose.order) order.push(p, ...ids.filter((id) => placeOf(id) === p));
  const snapshot: Snapshot = { version: 1, order, blocks };
  run.snapshots = [snapshot];
  events.push({
    key: "document.seeded",
    batch: run.batch,
    type: "document.seeded",
    snapshot,
    conflicts: run.conflicts,
    flags: { ...run.flags },
  });
  for (const id of ids) {
    const r = results.get(`${id}:${used[id]}`);
    recordRender(run, events, {
      version: 1,
      block: id,
      call: "render:seed",
      result: `${id}:${used[id]}`,
      ok: r?.ok === true,
      error: r?.ok === true ? null : r?.error || "no render",
    });
    (run.charts.plans[id] as ChartPlan).seed = null;
  }
  run.momentsDue = true;
  // without rounds, the close still settles what no round checked and renders that version
  run.next =
    run.mode === "thorough" && !run.flags.fewDrafts
      ? { phase: "round", round: 1 }
      : { phase: "close" };
}

function recordRender(run: RunState, events: RunEvent[], render: ChartRender) {
  run.charts.renders.push(render);
  events.push({
    key: `chart.rendered:${render.block}:${render.version}`,
    batch: run.batch,
    type: "chart.rendered",
    ...render,
  });
}

// ---------------------------------------------------------------------------------------------
// The rounds

/** The disputes a round checks: open, and opened before it. */
export function visibleDisputes(state: RunState, round: number): Dispute[] {
  return Object.values(state.charts.disputes)
    .filter((d) => d.state === "open" && d.openedRound < round)
    .sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
}

export function openDisputes(state: RunState): Dispute[] {
  return Object.values(state.charts.disputes).filter((d) => d.state === "open");
}

export function disputeView(state: RunState, d: Dispute, model: ModelId): DisputeView {
  return {
    chart: d.block,
    row: d.row,
    values: d.values.map((v) => {
      const s = state.sources.find((x) => x.id === v.source);
      return {
        id: v.id,
        value: String(v.value),
        source: v.source,
        url: s?.url ?? "",
        title: s?.title ?? "",
        quote: v.quote || s?.quote || "",
        yours: v.support.includes(model),
      };
    }),
  };
}

/**
 * What one model's round brought to the charts: its layer patches, its data patches (at most the
 * cap of the round across all charts, extras cut in order) and its checks of the sources.
 */
export function readChartRound(
  run: RunState,
  input: {
    model: ModelId;
    round: 1 | 2 | 3;
    output: Partial<OutputOf<"round2">>;
    events: RunEvent[];
  },
): { candidates: Candidate[]; data: DataCandidate[] } {
  const { model, round } = input;
  const snapshot = run.snapshots.at(-1);
  const candidates: Candidate[] = [];
  const data: DataCandidate[] = [];
  if (round < 3 && input.output.patches) {
    const cap = round === 1 ? run.config.caps.round1 : run.config.caps.round2;
    const locks = new Set<string>();
    const known = new Set(run.sources.map((s) => s.id));
    for (const [index, p] of input.output.patches.entries()) {
      const id = p.chart.trim();
      const drop = (why: DroppedPatch["why"], detail = "") =>
        dropPatch(run, input.events, {
          round: round as 1 | 2,
          model,
          index,
          block: id,
          layer: p.layer,
          path: p.path,
          why,
          detail,
        });
      if (index >= cap) {
        drop("over_cap");
        continue;
      }
      if (p.kind === "style") {
        drop("style");
        continue;
      }
      if (!isOneSentence(p.reason)) {
        drop("reason_not_one_sentence");
        continue;
      }
      const block = chartIn(snapshot, id);
      if (!block) {
        drop("unknown_chart", "A patch names a chart of the answer.");
        continue;
      }
      if (p.layer === "data") {
        const checked = checkDataPatch(run, block, p, known);
        if ("why" in checked) {
          drop(checked.why, checked.detail);
          continue;
        }
        if (locks.has(`${id}/data/${checked.row}`)) {
          drop("row_in_dispute", "one patch per row");
          continue;
        }
        locks.add(`${id}/data/${checked.row}`);
        data.push({ ...checked, model, block: id, reason: p.reason.trim() });
        continue;
      }
      const checked = checkPatch(block, { layer: p.layer, path: p.path, value: p.value });
      if (!checked.ok) {
        drop(checked.why, checked.detail);
        continue;
      }
      if (locks.has(`${id}/${p.layer}`)) {
        drop("same_layer", "one patch per layer and round");
        continue;
      }
      locks.add(`${id}/${p.layer}`);
      candidates.push({
        model,
        index,
        block: id,
        op: "patch",
        layer: p.layer,
        path: p.path.trim(),
        kind: p.kind,
        text: JSON.stringify(checked.value),
        reason: p.reason.trim(),
        sources: [...new Set(p.sources.map((s) => s.trim()))].filter((s) => known.has(s)),
      });
    }
  }
  const visible = visibleDisputes(run, round);
  const recorded: {
    block: string;
    row: string;
    value: string;
    verdict: Verdict;
    reason: string;
  }[] = [];
  for (const c of input.output.checks ?? []) {
    const dispute = visible.find(
      (d) => d.block === c.chart.trim() && normalizeKey(d.row) === normalizeKey(c.row),
    );
    const value = dispute?.values.find((v) => v.id === c.value.trim());
    if (!dispute || !value || value.support.includes(model)) continue;
    const checks = dispute.checks[value.id] ?? {};
    if (checks[model] !== undefined) continue;
    checks[model] = c.verdict;
    dispute.checks[value.id] = checks;
    recorded.push({
      block: dispute.block,
      row: dispute.row,
      value: value.id,
      verdict: c.verdict,
      reason: c.reason.trim(),
    });
  }
  if (recorded.length > 0)
    input.events.push({
      key: `rows.checked:${round}:${model}`,
      batch: run.batch,
      type: "rows.checked",
      model,
      round,
      checks: recorded,
    });
  return { candidates, data };
}

/**
 * The checks of a data patch: a number, one source of the run, a quote that states the number, and
 * a row that is not in dispute. It never sets the value: it opens a dispute.
 */
function checkDataPatch(
  run: RunState,
  block: Chart,
  p: PatchOutput,
  known: ReadonlySet<string>,
):
  | Omit<DataCandidate, "model" | "block" | "reason">
  | { why: DroppedPatch["why"]; detail: string } {
  const value = readModelNumber(readValueText(p.value));
  if (value === null) return { why: "not_a_number", detail: p.value };
  const source = p.sources.map((s) => s.trim()).find((s) => known.has(s));
  if (!source) return { why: "unknown_source", detail: "A data patch cites a source of the run." };
  const quote = p.quote.trim();
  if (!quoteStates(value, quote))
    return { why: "not_stated", detail: "The quote does not state the value." };
  const key = p.path.trim();
  if (key === "") return { why: "unknown_path", detail: "A data patch names its row." };
  const row = block.data.rows.find((r) => normalizeKey(r.key) === normalizeKey(key));
  const rowKey = row?.key ?? key;
  if (
    openDisputes(run).some(
      (d) => d.block === block.id && normalizeKey(d.row) === normalizeKey(rowKey),
    )
  )
    return { why: "row_in_dispute", detail: "The row is being checked." };
  if (
    row &&
    [row, ...row.alternatives].some(
      (v) => typeof v.values.value === "number" && sameValue(v.values.value, value),
    )
  )
    return { why: "no_change", detail: "The row has that value." };
  return { row: rowKey, value, source, quote };
}

function readValueText(text: string): string {
  const v = readValue(text);
  return typeof v === "number" ? String(v) : typeof v === "string" ? v : text;
}

function layerOrder(c: Candidate): number {
  return CHART_LAYERS.indexOf(c.layer as ChartLayer);
}

/** The layer patches that need the render gate: everything but the caption, which is not drawn. */
export function needsRender(c: Candidate): boolean {
  return c.op === "patch" && c.layer !== "caption";
}

export function gateCall(
  state: RunState,
  kit: StepKit,
  round: 1 | 2,
  candidates: readonly Candidate[],
): Call {
  const snapshot = state.snapshots.at(-1);
  const apply = (chart: Chart, c: Candidate) =>
    patchChart(chart, c.layer as ChartLayer, c.path ?? "", JSON.parse(c.text));
  const specs = candidates.flatMap((c, i) => {
    const block = chartIn(snapshot, c.block);
    if (!needsRender(c) || !block) return [];
    const own = candidates.filter(
      (o) => o.model === c.model && o.block === c.block && o !== c && needsRender(o),
    );
    const together = [c, ...own].sort((a, b) => layerOrder(a) - layerOrder(b));
    return [
      { id: `p${i}`, spec: chartSpec(apply(block, c)) },
      // with the author's other patches of the chart in the round (a new transform and the
      // encoding of its fields)
      ...(own.length > 0 ? [{ id: `p${i}+`, spec: chartSpec(together.reduce(apply, block)) }] : []),
    ];
  });
  return renderCall(state, kit, `render:gate:${round}`, specs);
}

/** The candidates that rendered; the others are dropped with the renderer's error. */
export function reduceGate(
  run: RunState,
  round: 1 | 2,
  candidates: readonly Candidate[],
  outputs: Map<string, Output>,
  events: RunEvent[],
): Candidate[] {
  const results = renderResults(outputs, `render:gate:${round}`);
  const kept: Candidate[] = [];
  for (const [i, c] of candidates.entries()) {
    const r = results.get(`p${i}`);
    if (!needsRender(c) || r?.ok || results.get(`p${i}+`)?.ok) {
      kept.push(c);
      continue;
    }
    dropPatch(run, events, {
      round,
      model: c.model,
      index: c.index ?? i,
      block: c.block,
      layer: c.layer as ChartLayer,
      path: c.path ?? "",
      why: "render_failed",
      detail: r?.error || "no render",
    });
  }
  return kept;
}

/** A patch dropped by its checks or by the render gate: kept in the state, and an event. */
function dropPatch(run: RunState, events: RunEvent[], dropped: DroppedPatch) {
  run.charts.dropped.push(dropped);
  events.push({
    key: `patch.dropped:${dropped.round}:${dropped.model}:${dropped.index}`,
    batch: run.batch,
    type: "patch.dropped",
    ...dropped,
  });
}

/** Data patches open disputes, checked in the next round. Returns how many opened. */
export function placeDataPatches(
  run: RunState,
  round: 1 | 2,
  data: readonly DataCandidate[],
  events: RunEvent[],
): number {
  const snapshot = run.snapshots.at(-1);
  const byRow = new Map<string, DataCandidate[]>();
  for (const d of data) {
    const k = `${d.block}/${normalizeKey(d.row)}`;
    byRow.set(k, [...(byRow.get(k) ?? []), d]);
  }
  let opened = 0;
  for (const list of byRow.values()) {
    const first = list[0] as DataCandidate;
    const block = chartIn(snapshot, first.block);
    if (!block) continue;
    const existing = block.data.rows.find((r) => normalizeKey(r.key) === normalizeKey(first.row));
    const base: Row = existing
      ? clone(existing)
      : {
          key: first.row,
          values: { value: null },
          source: "",
          quote: "",
          support: [],
          status: "single",
          alternatives: [],
        };
    const values: Row[] = existing
      ? [base, ...base.alternatives.map((a) => ({ ...base, ...a, alternatives: [] }))]
      : [];
    const groups = groupSame(
      [...list].sort((a, b) => byModelOrder(a.model, b.model)),
      (d) => d.value,
      values.map((v) => (typeof v.values.value === "number" ? v.values.value : Number.NaN)),
    );
    groups.forEach((g, i) => {
      const same = values[i];
      if (same) {
        for (const d of g.items) if (!same.support.includes(d.model)) same.support.push(d.model);
        return;
      }
      const d = g.items[0] as DataCandidate;
      values.push({
        ...base,
        values: { value: d.value },
        source: d.source,
        quote: d.quote,
        support: uniqueSorted(
          g.items.map((x) => x.model),
          byModelOrder,
        ),
        alternatives: [],
      });
    });
    const [main, ...rest] = values;
    if (!main) continue;
    const dispute = openDispute(
      run,
      block.id,
      { ...base, ...main, alternatives: rest } as Row,
      round,
    );
    opened++;
    events.push({
      key: `dispute.opened:${dispute.id}`,
      batch: run.batch,
      type: "dispute.opened",
      dispute: clone(dispute),
    });
  }
  return opened;
}

/** Whether a dispute opened in this round waits for the checks of the next round. */
export function disputesAwaitChecks(state: RunState, round: number): boolean {
  return openDisputes(state).some((d) => d.openedRound >= round);
}

export function hasOpenDisputes(state: RunState): boolean {
  return openDisputes(state).length > 0;
}

// ---------------------------------------------------------------------------------------------
// Settling the data by source

export interface RowSettlement {
  block: string;
  row: string;
  state: Exclude<Dispute["state"], "open">;
  winner: DisputeValue | null;
  values: DisputeValue[];
}

/** How many of the models that did not give a value checked it, and how many said it holds. */
export function holdsOf(d: Dispute, v: DisputeValue): { holds: number; checkers: number } {
  const checks = d.checks[v.id] ?? {};
  let holds = 0;
  let checkers = 0;
  for (const m of MODELS) {
    if (v.support.includes(m)) continue;
    const verdict = checks[m];
    if (verdict === undefined) continue;
    checkers++;
    if (verdict === "holds") holds++;
  }
  return { holds, checkers };
}

/** The models that did not give a value and said that its source holds. */
export function confirmersOf(d: Dispute, v: DisputeValue): ModelId[] {
  const checks = d.checks[v.id] ?? {};
  return MODELS.filter((m) => !v.support.includes(m) && checks[m] === "holds");
}

/**
 * "The source holds up": the quote of the value states it (code: `quoteStates`, on the model's quote
 * or the search excerpt of the source), and a strict majority of the models that did not give the
 * value and checked it say that the quote, from that page, states that number for that row. The
 * number itself is never voted on: each value is judged on its own source.
 */
export function holdsUp(d: Dispute, v: DisputeValue): boolean {
  const { holds, checkers } = holdsOf(d, v);
  return v.stated && holds >= 1 && holds * 2 > checkers;
}

/**
 * Settles, at a round boundary, the disputes that round checked (all of them with `final`):
 * exactly one value that holds up becomes the row's value ("held"); a single value that does not is
 * kept and marked ("unverified"); otherwise every value stays with its source and the row is drawn
 * as a range ("unsettled"). A dispute that no round checked ends "unchecked": a single value stays
 * as it is, several are a range.
 */
export function settleDisputes(
  run: RunState,
  input: { final: boolean; round: number },
  events: RunEvent[],
): RowSettlement[] {
  const out: RowSettlement[] = [];
  const due = Object.values(run.charts.disputes)
    .filter((d) => d.state === "open" && (input.final || d.openedRound < input.round))
    .sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
  for (const d of due) {
    const checked = d.openedRound < input.round && Object.keys(d.checks).length > 0;
    const holding = d.values.filter((v) => holdsUp(d, v));
    let state: RowSettlement["state"];
    let winner: DisputeValue | null = null;
    if (!checked) state = "unchecked";
    else if (holding.length === 1) {
      state = "held";
      winner = holding[0] as DisputeValue;
    } else state = d.values.length === 1 ? "unverified" : "unsettled";
    d.state = state;
    d.winner = winner?.id ?? null;
    out.push({ block: d.block, row: d.row, state, winner, values: clone(d.values) });
    events.push({
      key: `dispute.settled:${d.id}`,
      batch: run.batch,
      type: "dispute.settled",
      dispute: d.id,
      block: d.block,
      row: d.row,
      state,
      winner: d.winner,
      holds: Object.fromEntries(
        d.values.map((v) => [v.id, { ...holdsOf(d, v), stated: v.stated }]),
      ),
    });
  }
  return out;
}

/** The rows of a chart after the settlements, in one deterministic pass by row key. */
export function settleRows(chart: Chart, settlements: readonly RowSettlement[]): Chart {
  if (settlements.length === 0) return chart;
  const next = clone(chart);
  const sorted = [...settlements].sort((a, b) => (a.row < b.row ? -1 : a.row > b.row ? 1 : 0));
  for (const s of sorted) {
    const toRow = (v: DisputeValue) => ({
      values: { value: v.value },
      source: v.source,
      quote: v.quote,
      support: [...v.support],
    });
    const index = next.data.rows.findIndex((r) => r.key === s.row);
    // a row a data patch proposed that no round checked is not added
    if (index < 0 && s.state === "unchecked") continue;
    const [first, ...others] = s.winner ? [s.winner] : s.values;
    if (!first) continue;
    const status: RowStatus =
      s.state === "held"
        ? "held"
        : s.state === "unverified"
          ? "unverified"
          : s.values.length > 1
            ? "unsettled"
            : index >= 0
              ? (next.data.rows[index]?.status ?? "single")
              : "single";
    const row: Row = { key: s.row, ...toRow(first), status, alternatives: others.map(toRow) };
    if (index >= 0) next.data.rows[index] = row;
    else next.data.rows.push(row);
  }
  if (temporalKeys(next.data.rows)) next.data.rows.sort((a, b) => (a.key < b.key ? -1 : 1));
  return next;
}

// ---------------------------------------------------------------------------------------------
// The render of each version

function rendered(state: RunState, block: string, version: number): ChartRender | undefined {
  return state.charts.renders.findLast((r) => r.block === block && r.version === version);
}

/**
 * After a new version: a chart it left as it was keeps the render of the version before, without
 * a render call (the edit of a paragraph, a change to another chart).
 */
export function carryRenders(run: RunState, events: RunEvent[]) {
  const last = run.snapshots.at(-1);
  const before = run.snapshots.at(-2);
  if (!last || !before) return;
  for (const chart of chartsOf(last)) {
    if (rendered(run, chart.id, last.version)) continue;
    const previous = chartIn(before, chart.id);
    const render = rendered(run, chart.id, before.version);
    if (!previous || !render || JSON.stringify(previous) !== JSON.stringify(chart)) continue;
    recordRender(run, events, { ...render, version: last.version });
  }
}

/** The latest version, when one of its charts has no render yet, and those charts. */
export function versionToRender(state: RunState): { snapshot: Snapshot; blocks: string[] } | null {
  const last = state.snapshots.at(-1);
  if (!last || !hasCharts(state)) return null;
  const blocks = chartsOf(last)
    .filter((c) => !rendered(state, c.id, last.version))
    .map((c) => c.id);
  return blocks.length > 0 ? { snapshot: last, blocks } : null;
}

export function versionRenderCall(
  state: RunState,
  kit: StepKit,
  pending: { snapshot: Snapshot; blocks: string[] },
): Call {
  return renderCall(
    state,
    kit,
    `render:v${pending.snapshot.version}`,
    pending.blocks.map((id) => ({ id, spec: chartSpec(pending.snapshot.blocks[id] as Chart) })),
  );
}

/**
 * Records the render of each chart of a version. A chart that does not render (two patches that
 * render alone but not together) gets back the layers of its last version that rendered, in a new
 * version.
 */
export function reduceVersionRender(
  run: RunState,
  outputs: Map<string, Output>,
  events: RunEvent[],
) {
  const snapshot = run.snapshots.at(-1) as Snapshot;
  const key = `render:v${snapshot.version}`;
  const results = renderResults(outputs, key);
  const reverted: Snapshot["blocks"] = {};
  for (const chart of chartsOf(snapshot)) {
    if (rendered(run, chart.id, snapshot.version)) continue;
    const r = results.get(chart.id);
    recordRender(run, events, {
      version: snapshot.version,
      block: chart.id,
      call: key,
      result: chart.id,
      ok: r?.ok === true,
      error: r?.ok ? null : r?.error || "no render",
    });
    if (r?.ok || run.charts.reverts.includes(snapshot.version)) continue;
    const good = run.charts.renders.findLast(
      (x) => x.block === chart.id && x.ok && x.version < snapshot.version,
    );
    const source = good
      ? chartIn(
          run.snapshots.find((s) => s.version === good.version),
          chart.id,
        )
      : null;
    if (!source) continue;
    // keep the rows as they were settled: only the layers that are drawn go back
    reverted[chart.id] = { ...clone(source), data: clone(chart.data) };
  }
  if (Object.keys(reverted).length === 0) return;
  const next: Snapshot = {
    version: snapshot.version + 1,
    order: [...snapshot.order],
    blocks: { ...snapshot.blocks, ...reverted },
  };
  run.snapshots.push(next);
  run.charts.reverts.push(next.version);
  events.push({
    key: `snapshot.created:${next.version}`,
    batch: run.batch,
    type: "snapshot.created",
    snapshot: next,
    cause: "render",
    threads: [],
  });
  carryRenders(run, events);
}
