import {
  carriesData,
  chartSpec,
  checkPatch,
  defaultLayers,
  layersFromSpec,
  type PatchDropReason,
  patchChart,
  quoteStates,
  readModelNumber,
  readValue,
  sameValue,
  temporalKeys,
  transformFields,
  transformProblem,
} from "./chart.ts";
import { type Dataset, describeDataset } from "./csv.ts";
import type { RunEvent } from "./events.ts";
import {
  CHART_LAYERS,
  type Chart,
  type ChartLayer,
  type ChartOrigin,
  foundAgain,
  MODELS,
  type ModelId,
  type Row,
  type RowStatus,
  type Snapshot,
  type Source,
} from "./model.ts";
import {
  briefUserPrompt,
  briefWebPrompt,
  chartMergePrompt,
  chartRoundPrompt,
  chartSpecPrompt,
  type DisputeView,
  type MergeBrief,
} from "./prompts/chart.ts";
import type { ThreadView } from "./prompts/round.ts";
import type { Call, RunState } from "./reducer.ts";
import type { OutputOf, PatchOutput } from "./schemas.ts";
import type { Candidate } from "./threads.ts";
import { normalizeUrl } from "./urls.ts";
import {
  byModelOrder,
  clone,
  hash,
  isOneSentence,
  normalizeText,
  seededShuffle,
  uniqueSorted,
} from "./util.ts";

// The chart path of a run (phase 4). Data first, design second:
//   drafting  brief:0:<model>   4 briefs (web: rows with citations found by search in that call)
//   merging   chart-merge:0     web only: the utility model aligns labels; code compares the values
//             spec:0:<writer>   one model writes the Vega-Lite spec (chosen like the editor)
//             render:seed       the render gate on the writer's spec and on the plain one of code
//   round1-3  round:<n>:<model> patches on the layers, votes, and checks of the sources of the rows
//             render:gate:<n>   every patch is rendered before it reaches a vote
//             render:v<n>       every new version of the chart is rendered (its SVG)
// There is no editor pass: the caption is a layer, settled in the rounds like the others.

/** What makes a run a chart run: the request says so, with the uploaded data or none (web data). */
export interface ChartInput {
  /** The upload, parsed by `parseCsv` before the run starts; null: the models find the data on the web. */
  dataset: Dataset | null;
}

/** The limits of a chart run. */
export const CHART_LIMITS = { rowsPerBrief: 24, rows: 40 };

export const CHART_ID = "c1";

export interface BriefRow {
  id: string; // "B3": the label of the brief and the row number, anonymized
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

export interface ChartBrief {
  model: ModelId;
  label: string;
  question: string;
  dimension: string;
  measures: string[];
  mark: string;
  /** User data: the transform the brief proposed, null when it was not allowed or not JSON. */
  transform: unknown[] | null;
  rows: BriefRow[];
  dropped: { key: string; why: BriefRowDrop }[];
}

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
 * A row of web data that the sources settle: a value given by one model only, or different values
 * for one row. Every model checks the sources of the values it did not give, in the round after the
 * dispute opened; the dispute is settled at that round's boundary (see `settleDisputes`).
 */
export interface Dispute {
  id: string; // "d1"
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
  layer: ChartLayer;
  path: string;
  why: PatchDropReason | DropReasonOfData | "over_cap" | "style" | "reason_not_one_sentence";
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

export interface ChartRunState {
  origin: ChartOrigin;
  dataset: Dataset | null;
  briefs: ChartBrief[];
  writer: ModelId | null;
  /** The chart agreed by the merge, before the spec: data, brief, transform, a plain encoding. */
  base: Chart | null;
  /** The two candidates of the seed render: the writer's layers and the plain ones of code. */
  seed: {
    writer: ChartLayers | null;
    plain: ChartLayers;
    why: string | null;
    stripped: string[];
  } | null;
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
  row: string;
  value: number;
  source: string;
  quote: string;
  reason: string;
}

export function createChartState(input: ChartInput | null | undefined): ChartRunState | null {
  if (!input) return null;
  return {
    origin: input.dataset ? "user" : "web",
    dataset: input.dataset ? clone(input.dataset) : null,
    briefs: [],
    writer: null,
    base: null,
    seed: null,
    disputes: {},
    renders: [],
    dropped: [],
    reverts: [],
    counters: { dispute: 0 },
  };
}

/** The helpers of the reducer the chart path uses (passed in, so that the modules stay acyclic). */
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

function chartOf(state: RunState): ChartRunState {
  if (!state.chart) throw new Error("not a chart run");
  return state.chart;
}

function label(runId: string, model: ModelId): string {
  return "ABCD"[seededShuffle(MODELS, `${runId}|drafts`).indexOf(model)] ?? "X";
}

// ---------------------------------------------------------------------------------------------
// Drafting: the briefs

export function briefCalls(state: RunState, kit: StepKit): Call[] {
  const chart = chartOf(state);
  if (chart.origin === "web") {
    const maxResults = state.config.searchResultsPerDraft;
    const prompt = briefWebPrompt({
      question: state.question,
      maxResults,
      maxRows: CHART_LIMITS.rowsPerBrief,
    });
    return MODELS.map((m) =>
      kit.call(state, `brief:0:${m}`, m, "brief_web", prompt, { maxResults }),
    );
  }
  const dataset = chart.dataset as Dataset;
  const prompt = briefUserPrompt({
    question: state.question,
    columns: describeDataset(dataset),
    rows: dataset.rows.length,
  });
  return MODELS.map((m) => kit.call(state, `brief:0:${m}`, m, "brief_user", prompt));
}

interface Output {
  call: Call;
  output: unknown;
  sources: { url: string; title: string; quote: string }[];
}

export function reduceBriefs(
  run: RunState,
  outputs: Map<string, Output>,
  events: RunEvent[],
): boolean {
  const chart = chartOf(run);
  const urls = new Map<string, string>();
  for (const s of run.sources) {
    const key = normalizeUrl(s.url);
    if (key && !urls.has(key)) urls.set(key, s.id);
  }
  const columns = new Set(chart.dataset?.columns.map((c) => c.name) ?? []);
  for (const model of MODELS) {
    const out = outputs.get(`brief:0:${model}`);
    if (!out) continue;
    const lbl = label(run.id, model);
    const added: Source[] = [];
    const again: string[] = [];
    let brief: ChartBrief;
    if (chart.origin === "web") {
      const o = out.output as OutputOf<"brief_web">;
      const found = new Map<string, string>(); // normalized URL → the excerpt of the search
      for (const f of out.sources) {
        const key = normalizeUrl(f.url.trim());
        if (!key) continue;
        found.set(key, f.quote);
        const known = urls.get(key);
        if (known) {
          if (foundAgain(run.sources, known, model)) again.push(known);
          continue;
        }
        const source: Source = {
          id: `src${++run.counters.source}`,
          url: f.url.trim(),
          title: f.title,
          quote: f.quote,
          foundBy: model,
        };
        urls.set(key, source.id);
        run.sources.push(source);
        added.push(source);
      }
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
        // a row counts only if the search of this call returned its source
        const url = normalizeUrl(r.source.trim());
        if (!url || !found.has(url)) {
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
          id: `${lbl}${rows.length + 1}`,
          key,
          value,
          source: urls.get(url) as string,
          quote,
          stated: quoteStates(value, quote) || quoteStates(value, found.get(url) ?? ""),
        });
      }
      brief = {
        model,
        label: lbl,
        question: o.question.trim(),
        dimension: o.dimension.trim(),
        measures: [o.measure.trim()],
        mark: o.mark,
        transform: [],
        rows,
        dropped,
      };
    } else {
      const o = out.output as OutputOf<"brief_user">;
      const raw = readValue(o.transform);
      const transform: unknown[] | null =
        Array.isArray(raw) &&
        !carriesData(raw) &&
        transformProblem(raw, {
          data: { origin: "user", columns: chart.dataset?.columns ?? [], rows: [] },
        }) === null
          ? raw
          : null;
      // the brief may name the columns and the fields its own transform makes
      const fields = transformFields(transform ?? []);
      const known = (name: string) =>
        name !== "" && (columns.has(name) || fields.names.has(name) || fields.open);
      brief = {
        model,
        label: lbl,
        question: o.question.trim(),
        dimension: known(o.dimension.trim()) ? o.dimension.trim() : "",
        measures: o.measures.map((m) => m.trim()).filter(known),
        mark: o.mark,
        transform,
        rows: [],
        dropped: [],
      };
    }
    chart.briefs.push(brief);
    events.push({
      key: `brief.completed:${model}`,
      batch: run.batch,
      type: "brief.completed",
      model,
      brief: clone(brief),
      sources: added,
      ...(again.length > 0 && { alsoFound: again }),
    });
  }
  if (chart.briefs.length === 0) return false;
  if (chart.origin === "web" && chart.briefs.every((b) => b.rows.length === 0)) return false;
  return true;
}

/** The code's notion of the same row label: lower case, no accents, collapsed whitespace. */
export function normalizeKey(key: string): string {
  return normalizeText(key.normalize("NFD").replace(/\p{M}/gu, ""));
}

// ---------------------------------------------------------------------------------------------
// Merging: labels by the utility model (web), everything else by code

export function chartMergeCalls(state: RunState, kit: StepKit): Call[] {
  const chart = chartOf(state);
  if (chart.origin !== "web") return [];
  const briefs: MergeBrief[] = chart.briefs
    .map((b) => ({
      label: b.label,
      question: b.question,
      dimension: b.dimension,
      measure: b.measures[0] ?? "",
      rows: b.rows.map((r) => ({ id: r.id, key: r.key })),
    }))
    .sort((a, b) => (a.label < b.label ? -1 : 1));
  return [
    kit.call(
      state,
      "chart-merge:0",
      "utility",
      "chart_merge",
      chartMergePrompt({ question: state.question, briefs }),
    ),
  ];
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

/**
 * The merge of a chart run. Web data: rows are matched by label (the utility model's alignment, or
 * the normalized label when it gave none); rows of a draft whose measure is not the agreed one are
 * left out; values of one row from several models are compared by code (`sameValue`): the same
 * value from two models is support, different values are kept as alternatives and open a dispute,
 * and a value from one model opens one too (its source is checked). User data: the dimension, the
 * measures, the transform and the mark most briefs chose (ties by model order).
 */
export function reduceChartMerge(run: RunState, outputs: Map<string, Output>, events: RunEvent[]) {
  const chart = chartOf(run);
  const briefs = chart.briefs;
  const mark =
    majority(
      briefs.map((b) => ({ model: b.model, value: b.mark })),
      (v) => v,
    ) ?? "bar";
  const merge = outputs.get("chart-merge:0")?.output as OutputOf<"chart_merge"> | undefined;
  let base: Chart;
  if (chart.origin === "web") {
    const excluded = new Set(
      (merge?.drafts ?? []).filter((d) => d.measure === "different").map((d) => d.draft.trim()),
    );
    // never leave out every draft
    if (briefs.every((b) => excluded.has(b.label))) excluded.clear();
    const aligned = new Map<string, string>();
    for (const k of merge?.keys ?? [])
      if (!aligned.has(k.row.trim())) aligned.set(k.row.trim(), k.key.trim());
    const groups = new Map<
      string,
      { label: string; order: number; entries: { model: ModelId; row: BriefRow }[] }
    >();
    let order = 0;
    for (const b of briefs) {
      if (excluded.has(b.label)) continue;
      for (const r of b.rows) {
        const lbl = aligned.get(r.id) || r.key;
        const k = normalizeKey(lbl);
        let g = groups.get(k);
        if (!g) {
          g = { label: lbl, order: order++, entries: [] };
          groups.set(k, g);
        }
        if (!g.entries.some((e) => e.model === b.model)) g.entries.push({ model: b.model, row: r });
      }
    }
    let list = [...groups.values()];
    const rowsOf = (g: (typeof list)[number]) => buildRow(g.label, g.entries);
    let rows = list.map(rowsOf);
    if (temporalKeys(rows)) {
      list = list.sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
      rows = list.map(rowsOf);
    }
    rows = rows.slice(0, CHART_LIMITS.rows);
    const kept = briefs.filter((b) => !excluded.has(b.label));
    const question =
      merge?.question.trim() ||
      majority(
        kept.map((b) => ({ model: b.model, value: b.question })),
        normalizeText,
      ) ||
      run.question;
    const dimension =
      merge?.dimension.trim() ||
      majority(
        kept.map((b) => ({ model: b.model, value: b.dimension })),
        normalizeText,
      ) ||
      "";
    const measure =
      merge?.measure.trim() ||
      majority(
        kept.map((b) => ({ model: b.model, value: b.measures[0] ?? "" })),
        normalizeText,
      ) ||
      "";
    base = {
      kind: "chart",
      id: CHART_ID,
      brief: { question, measures: [measure], dimensions: [dimension] },
      data: { origin: "web", columns: [], rows },
      transform: [],
      encoding: {},
      mark,
      title: "",
      caption: "",
    };
    for (const row of rows) {
      if (row.status !== "single" && row.status !== "disputed") continue;
      const dispute = openDispute(run, row, 0);
      events.push({
        key: `dispute.opened:${dispute.id}`,
        batch: run.batch,
        type: "dispute.opened",
        dispute: clone(dispute),
      });
    }
  } else {
    const dataset = chart.dataset as Dataset;
    const base0 = baseBrief(briefs);
    const dimension = base0?.dimension ?? dataset.columns[0]?.name ?? "";
    const measures =
      base0?.measures ??
      dataset.columns
        .filter((c) => c.type === "number")
        .map((c) => c.name)
        .slice(0, 1);
    const transform = base0?.transform ?? [];
    const question = base0?.question || run.question;
    base = {
      kind: "chart",
      id: CHART_ID,
      brief: { question, measures, dimensions: [dimension] },
      data: {
        origin: "user",
        columns: clone(dataset.columns),
        rows: dataset.rows.map((values, i) => ({
          key: `r${i + 1}`,
          values: { ...values },
          source: "upload",
          quote: "",
          support: [],
          status: "upload" as const,
          alternatives: [],
        })),
      },
      transform: clone(transform),
      encoding: {},
      mark,
      title: "",
      caption: "",
    };
  }
  const plain = defaultLayers(base, base.mark);
  base.encoding = plain.encoding;
  chart.base = base;
  chart.writer = chooseWriter(run);
  run.next = { phase: "spec" };
}

/** The ops of a transform, in order: what two briefs that compute the same thing share. */
function shapeOf(transform: readonly unknown[]): string {
  return transform
    .map((t) => (t && typeof t === "object" ? (Object.keys(t).find((k) => k !== "as") ?? "") : ""))
    .join(">");
}

/**
 * User data: the brief the merge keeps whole, so that its dimension, measures and transform fit
 * together. Among the briefs with a dimension, measures and an allowed transform, the one that
 * shares the most with the others: the dimension most chose and the shape of transform most chose
 * (the same ops in the same order: field names differ between models). Ties by model order.
 */
function baseBrief(briefs: readonly ChartBrief[]): ChartBrief | null {
  const valid = briefs.filter((b) => b.dimension !== "" && b.measures.length > 0 && b.transform);
  if (valid.length === 0) return null;
  const dimension = majority(
    valid.map((b) => ({ model: b.model, value: b.dimension })),
    (v) => v,
  );
  const shape = majority(
    valid.map((b) => ({ model: b.model, value: shapeOf(b.transform ?? []) })),
    (v) => v,
  );
  const score = (b: ChartBrief) =>
    Number(b.dimension === dimension) + Number(shapeOf(b.transform ?? []) === shape);
  return (
    [...valid].sort((a, b) => score(b) - score(a) || byModelOrder(a.model, b.model))[0] ?? null
  );
}

function buildRow(label: string, entries: readonly { model: ModelId; row: BriefRow }[]): Row {
  const clusters: { value: number; entries: { model: ModelId; row: BriefRow }[] }[] = [];
  for (const e of [...entries].sort((a, b) => byModelOrder(a.model, b.model))) {
    const c = clusters.find((x) => sameValue(x.value, e.row.value));
    if (c) c.entries.push(e);
    else clusters.push({ value: e.row.value, entries: [e] });
  }
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

function openDispute(run: RunState, row: Row, round: Dispute["openedRound"]): Dispute {
  const chart = chartOf(run);
  const id = `d${++chart.counters.dispute}`;
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
    block: CHART_ID,
    row: row.key,
    lockKey: `${CHART_ID}/data/${row.key}`,
    openedRound: round,
    values,
    checks: {},
    state: "open",
    winner: null,
  };
  chart.disputes[id] = dispute;
  return dispute;
}

function stated(run: RunState, value: number, quote: string, source: string): boolean {
  const excerpt = run.sources.find((s) => s.id === source)?.quote ?? "";
  return quoteStates(value, quote) || quoteStates(value, excerpt);
}

/**
 * The writer of the spec, chosen like the editor: the model whose brief is closest to the agreed
 * one (web: the most rows whose value is the row's agreed value; user: the most of dimension,
 * measures, transform and mark agreed), ties by a rotation seeded by the run id.
 */
export function chooseWriter(run: RunState): ModelId | null {
  const chart = chartOf(run);
  const base = chart.base;
  if (!base || chart.briefs.length === 0) return null;
  const start = hash(run.id) % MODELS.length;
  const rotation = [...MODELS.slice(start), ...MODELS.slice(0, start)];
  const briefed = new Set(chart.briefs.map((b) => b.model));
  const score = (m: ModelId): number => {
    const b = chart.briefs.find((x) => x.model === m);
    if (!b) return -1;
    if (base.data.origin === "web")
      return base.data.rows.filter((r) => r.support.includes(m)).length;
    return (
      Number(b.dimension === base.brief.dimensions[0]) +
      Number(
        JSON.stringify([...b.measures].sort()) === JSON.stringify([...base.brief.measures].sort()),
      ) +
      Number(JSON.stringify(b.transform) === JSON.stringify(base.transform)) +
      Number(b.mark === base.mark)
    );
  };
  let best: ModelId | null = null;
  for (const m of rotation)
    if (briefed.has(m) && (best === null || score(m) > score(best))) best = m;
  return best;
}

// ---------------------------------------------------------------------------------------------
// The spec and the seed render

export function specCalls(state: RunState, kit: StepKit, affordable: boolean): Call[] {
  const chart = chartOf(state);
  if (!chart.base || !chart.writer || !affordable) return [];
  const columns = chart.dataset ? describeDataset(chart.dataset) : null;
  return [
    kit.call(
      state,
      `spec:0:${chart.writer}`,
      chart.writer,
      "chart_spec",
      chartSpecPrompt({ question: state.question, chart: chart.base, columns }),
    ),
  ];
}

export function reduceSpec(run: RunState, outputs: Map<string, Output>) {
  const chart = chartOf(run);
  const base = chart.base as Chart;
  const out = chart.writer
    ? (outputs.get(`spec:0:${chart.writer}`)?.output as OutputOf<"chart_spec"> | undefined)
    : undefined;
  const title = out?.title.trim().slice(0, 120) || base.brief.question;
  const caption = out?.caption.trim().slice(0, 600) ?? "";
  const plain: ChartLayers = {
    mark: base.mark,
    encoding: clone(base.encoding),
    transform: clone(base.transform),
    title,
    caption,
  };
  let writer: ChartLayers | null = null;
  let why: string | null = out ? null : "no spec";
  let stripped: string[] = [];
  if (out) {
    const layers = layersFromSpec(out.spec, base);
    if (layers.ok) {
      // the transform is the one the briefs agreed on; the writer's is used only when there is none
      const transform = base.transform.length > 0 ? clone(base.transform) : layers.transform;
      writer = { mark: layers.mark, encoding: layers.encoding, transform, title, caption };
      stripped = layers.stripped;
    } else why = `${layers.why}: ${layers.detail}`;
  }
  chart.seed = { writer, plain, why, stripped };
  run.next = { phase: "seed" };
}

export function withLayers(chart: Chart, layers: ChartLayers): Chart {
  return { ...clone(chart), ...clone(layers) };
}

export function seedRenderCall(state: RunState, kit: StepKit): Call {
  const chart = chartOf(state);
  const base = chart.base as Chart;
  const seed = chart.seed as NonNullable<ChartRunState["seed"]>;
  const specs = [
    ...(seed.writer ? [{ id: "writer", spec: chartSpec(withLayers(base, seed.writer)) }] : []),
    { id: "plain", spec: chartSpec(withLayers(base, seed.plain)) },
  ];
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

type RenderResults = Map<string, { ok: boolean; error: string }>;

function renderResults(outputs: Map<string, Output>, key: string): RenderResults {
  const out = outputs.get(key)?.output as OutputOf<"render"> | undefined;
  const results: RenderResults = new Map();
  for (const r of out?.results ?? []) {
    if (!results.has(r.id)) results.set(r.id, { ok: r.status === "ok", error: r.error });
  }
  return results;
}

/** Seeds the document: the writer's chart if it renders, else the plain one; its render is version 1's. */
export function reduceSeedRender(run: RunState, outputs: Map<string, Output>, events: RunEvent[]) {
  const chart = chartOf(run);
  const base = chart.base as Chart;
  const seed = chart.seed as NonNullable<ChartRunState["seed"]>;
  const results = renderResults(outputs, "render:seed");
  const writerOk = seed.writer !== null && results.get("writer")?.ok === true;
  const used = writerOk ? "writer" : "plain";
  const layers = writerOk ? (seed.writer as ChartLayers) : seed.plain;
  const block = withLayers(base, layers);
  const snapshot: Snapshot = { version: 1, order: [block.id], blocks: { [block.id]: block } };
  run.snapshots = [snapshot];
  const why =
    seed.writer && !writerOk
      ? `render_failed: ${results.get("writer")?.error || "no render"}`
      : seed.why;
  events.push({
    key: `chart.written:${block.id}`,
    batch: run.batch,
    type: "chart.written",
    block: block.id,
    writer: chart.writer,
    used,
    why: why ?? null,
    stripped: seed.stripped,
  });
  events.push({
    key: "document.seeded",
    batch: run.batch,
    type: "document.seeded",
    snapshot,
    conflicts: [],
    flags: { ...run.flags },
  });
  recordRender(run, events, {
    version: 1,
    block: block.id,
    call: "render:seed",
    result: used,
    ok: results.get(used)?.ok === true,
    error: results.get(used)?.ok === true ? null : results.get(used)?.error || "no render",
  });
  chart.seed = null;
  run.momentsDue = true;
  // without rounds, the close still settles what no round checked and renders that version
  run.next =
    run.mode === "thorough" && !run.flags.fewDrafts
      ? { phase: "round", round: 1 }
      : { phase: "close" };
}

function recordRender(run: RunState, events: RunEvent[], render: ChartRender) {
  chartOf(run).renders.push(render);
  events.push({
    key: `chart.rendered:${render.version}`,
    batch: run.batch,
    type: "chart.rendered",
    ...render,
  });
}

// ---------------------------------------------------------------------------------------------
// The rounds

export const CHART_ROUND_KIND = {
  1: "chart_round1",
  2: "chart_round2",
  3: "chart_round3",
} as const;

export function chartRoundCalls(
  state: RunState,
  round: 1 | 2 | 3,
  kit: StepKit,
  threads: (voter: ModelId) => ThreadView[],
): Call[] {
  const chart = chartOf(state);
  const snapshot = state.snapshots.at(-1) as Snapshot;
  const block = snapshot.blocks[CHART_ID] as Chart;
  const columns = chart.dataset ? describeDataset(chart.dataset) : null;
  const locked = Object.values(state.threads)
    .filter((t) => t.state === "open")
    .map((t) => t.lockKey);
  const disputes = visibleDisputes(state, round);
  return MODELS.map((m) =>
    kit.call(
      state,
      `round:${round}:${m}`,
      m,
      CHART_ROUND_KIND[round],
      chartRoundPrompt({
        question: state.question,
        round,
        cap: round === 1 ? state.config.caps.round1 : state.config.caps.round2,
        chart: block,
        columns,
        sources: state.sources,
        threads: round === 1 ? [] : threads(m),
        locked: round === 3 ? [] : [...locked, ...openDisputes(state).map((d) => d.lockKey)],
        disputes: disputes.map((d) => disputeView(state, d, m)),
      }),
    ),
  );
}

/** The disputes a round checks: open, and opened before it. */
function visibleDisputes(state: RunState, round: number): Dispute[] {
  return Object.values(chartOf(state).disputes)
    .filter((d) => d.state === "open" && d.openedRound < round)
    .sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
}

function openDisputes(state: RunState): Dispute[] {
  return state.chart ? Object.values(state.chart.disputes).filter((d) => d.state === "open") : [];
}

function disputeView(state: RunState, d: Dispute, model: ModelId): DisputeView {
  return {
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

/** What one model's chart round brought: its layer patches, its data patches, its checks. */
export function readChartRound(
  run: RunState,
  input: {
    model: ModelId;
    round: 1 | 2 | 3;
    output: Partial<OutputOf<"chart_round2">>;
    events: RunEvent[];
  },
): { candidates: Candidate[]; data: DataCandidate[] } {
  const { model, round } = input;
  const block = run.snapshots.at(-1)?.blocks[CHART_ID] as Chart;
  const candidates: Candidate[] = [];
  const data: DataCandidate[] = [];
  if (round < 3 && input.output.patches) {
    const cap = round === 1 ? run.config.caps.round1 : run.config.caps.round2;
    const locks = new Set<string>();
    const known = new Set(run.sources.map((s) => s.id));
    for (const [index, p] of input.output.patches.entries()) {
      const drop = (why: DroppedPatch["why"], detail = "") =>
        dropPatch(run, input.events, {
          round: round as 1 | 2,
          model,
          index,
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
      if (p.layer === "data") {
        const checked = checkDataPatch(run, block, p, known);
        if ("why" in checked) {
          drop(checked.why, checked.detail);
          continue;
        }
        if (locks.has(`data/${checked.row}`)) {
          drop("row_in_dispute", "one patch per row");
          continue;
        }
        locks.add(`data/${checked.row}`);
        data.push({ ...checked, model, reason: p.reason.trim() });
        continue;
      }
      const checked = checkPatch(block, { layer: p.layer, path: p.path, value: p.value });
      if (!checked.ok) {
        drop(checked.why, checked.detail);
        continue;
      }
      if (locks.has(p.layer)) {
        drop("same_layer", "one patch per layer and round");
        continue;
      }
      locks.add(p.layer);
      candidates.push({
        model,
        index,
        block: CHART_ID,
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
  const recorded: { row: string; value: string; verdict: Verdict; reason: string }[] = [];
  for (const c of input.output.checks ?? []) {
    const dispute = visible.find((d) => normalizeKey(d.row) === normalizeKey(c.row));
    const value = dispute?.values.find((v) => v.id === c.value.trim());
    if (!dispute || !value || value.support.includes(model)) continue;
    const checks = dispute.checks[value.id] ?? {};
    if (checks[model] !== undefined) continue;
    checks[model] = c.verdict;
    dispute.checks[value.id] = checks;
    recorded.push({
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
 * The checks of a data patch of web data: a number, one source of the run, a quote that states the
 * number, and a row that is not in dispute. It never sets the value: it opens a dispute.
 */
function checkDataPatch(
  run: RunState,
  block: Chart,
  p: PatchOutput,
  known: ReadonlySet<string>,
): Omit<DataCandidate, "model" | "reason"> | { why: DroppedPatch["why"]; detail: string } {
  if (block.data.origin === "user")
    return { why: "user_data", detail: "The data of an upload is not the models' to change." };
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
  if (openDisputes(run).some((d) => normalizeKey(d.row) === normalizeKey(rowKey)))
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

/** The layer patches that need the render gate: everything but the caption, which is not drawn. */
function layerOrder(c: Candidate): number {
  return CHART_LAYERS.indexOf(c.layer as ChartLayer);
}

export function needsRender(c: Candidate): boolean {
  return c.op === "patch" && c.layer !== "caption";
}

export function gateCall(
  state: RunState,
  kit: StepKit,
  round: 1 | 2,
  candidates: readonly Candidate[],
): Call {
  const block = state.snapshots.at(-1)?.blocks[CHART_ID] as Chart;
  const apply = (chart: Chart, c: Candidate) =>
    patchChart(chart, c.layer as ChartLayer, c.path ?? "", JSON.parse(c.text));
  const specs = candidates.flatMap((c, i) => {
    if (!needsRender(c)) return [];
    const own = candidates.filter((o) => o.model === c.model && o !== c && needsRender(o));
    const together = [c, ...own].sort((a, b) => layerOrder(a) - layerOrder(b));
    return [
      { id: `p${i}`, spec: chartSpec(apply(block, c)) },
      // with the author's other patches of the round (a new transform and the encoding of its fields)
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
  chartOf(run).dropped.push(dropped);
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
  const block = run.snapshots.at(-1)?.blocks[CHART_ID] as Chart;
  const byRow = new Map<string, DataCandidate[]>();
  for (const d of data)
    byRow.set(normalizeKey(d.row), [...(byRow.get(normalizeKey(d.row)) ?? []), d]);
  let opened = 0;
  for (const list of byRow.values()) {
    const first = list[0] as DataCandidate;
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
    for (const d of [...list].sort((a, b) => byModelOrder(a.model, b.model))) {
      const same = values.find(
        (v) => typeof v.values.value === "number" && sameValue(v.values.value, d.value),
      );
      if (same) {
        if (!same.support.includes(d.model)) same.support.push(d.model);
        continue;
      }
      values.push({
        ...base,
        values: { value: d.value },
        source: d.source,
        quote: d.quote,
        support: [d.model],
        alternatives: [],
      });
    }
    const [main, ...rest] = values;
    if (!main) continue;
    const dispute = openDispute(run, { ...base, ...main, alternatives: rest } as Row, round);
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

/** Whether the chart run has a dispute opened in this round, which the next round checks. */
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
  if (!run.chart) return [];
  const out: RowSettlement[] = [];
  const due = Object.values(run.chart.disputes)
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

/** The latest version of the chart, when it has no render yet. */
export function versionToRender(state: RunState): Snapshot | null {
  if (!state.chart) return null;
  const last = state.snapshots.at(-1);
  if (!last?.blocks[CHART_ID]) return null;
  return state.chart.renders.some((r) => r.version === last.version) ? null : last;
}

export function versionRenderCall(state: RunState, kit: StepKit, snapshot: Snapshot): Call {
  return renderCall(state, kit, `render:v${snapshot.version}`, [
    { id: `v${snapshot.version}`, spec: chartSpec(snapshot.blocks[CHART_ID] as Chart) },
  ]);
}

/**
 * Records the render of a version. A version that does not render (two patches that render alone
 * but not together) is followed by a version with the chart of the last version that rendered,
 * whose render it reuses.
 */
export function reduceVersionRender(
  run: RunState,
  outputs: Map<string, Output>,
  events: RunEvent[],
) {
  const chart = chartOf(run);
  const snapshot = run.snapshots.at(-1) as Snapshot;
  const key = `render:v${snapshot.version}`;
  const r = renderResults(outputs, key).get(`v${snapshot.version}`);
  recordRender(run, events, {
    version: snapshot.version,
    block: CHART_ID,
    call: key,
    result: `v${snapshot.version}`,
    ok: r?.ok === true,
    error: r?.ok ? null : r?.error || "no render",
  });
  if (r?.ok || chart.reverts.includes(snapshot.version)) return;
  const good = [...chart.renders].reverse().find((x) => x.ok && x.version < snapshot.version);
  const source = good ? run.snapshots.find((s) => s.version === good.version) : undefined;
  if (!good || !source) return;
  const block = clone(source.blocks[CHART_ID] as Chart);
  // keep the rows as they were settled: only the layers that are drawn go back
  block.data = clone((snapshot.blocks[CHART_ID] as Chart).data);
  const reverted: Snapshot = {
    version: snapshot.version + 1,
    order: [...snapshot.order],
    blocks: { ...snapshot.blocks, [CHART_ID]: block },
  };
  run.snapshots.push(reverted);
  chart.reverts.push(reverted.version);
  events.push({
    key: `snapshot.created:${reverted.version}`,
    batch: run.batch,
    type: "snapshot.created",
    snapshot: reverted,
    cause: "render",
    threads: [],
  });
}
