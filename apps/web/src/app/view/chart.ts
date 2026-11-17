import {
  type CellValue,
  type Chart,
  type ChartAnswer,
  type ChartAnswerRow,
  type ChartLayer,
  type Column,
  type DissentNote,
  layerOf,
  MODELS,
  type ModelId,
  type RunView,
  readValue,
  type Snapshot,
  type Source,
  type Suggestion,
  selectChart,
  splitPath,
  type Thread,
} from "@chebot/protocol";
import { browserSpec, type Datum, temporalFields, withLocalDates } from "../chart/spec.ts";
import { t } from "../i18n/index.ts";
import { type Discussion, discussionOf } from "./discussion.ts";

// What the page of a chart run shows (step 41), from the replayed view and `selectChart`: the rows
// with their sources and notes, the layers the models voted on and their discussions, the
// calculation of an upload in plain words, and the steps of the history. No text here except
// through `t`.

/** How a web row ended, in the words of the table. */
export type RowKind =
  | "agreed" // two models or more gave the value, each with a citation
  | "confirmed" // one value, its source checked and held up
  | "corrected" // values in dispute, settled by the source that held up
  | "range" // values in dispute, none held up: drawn as a range
  | "lone" // one model's value that no source confirmed (or not yet checked)
  | "checking" // values in dispute, being checked
  | "upload";

/** A value given for a row, with who gave it, its citation and how its check went. */
export interface ValueView {
  value: number | null;
  text: string;
  source: Source | null;
  quote: string;
  support: ModelId[];
  verdict: "held" | "failed" | "partial" | "unchecked" | "checking";
  holds: number;
  checkers: number;
}

export interface RowView {
  key: string;
  /** The key as a reader says it: "marzo de 2025". */
  label: string;
  kind: RowKind;
  /** The value drawn; null for a range. */
  value: number | null;
  /** The value as the table writes it: "3,7", or "de 1,5 a 1,9" for a range. */
  text: string;
  source: Source | null;
  quote: string;
  support: ModelId[];
  /** The number of its note on the drawing and under it; null for a row without one. */
  note: number | null;
  /** The first sentence of the note. */
  noteText: string | null;
  /** The values that were given for the row, for the note. */
  values: ValueView[];
  /** The source that settled it, for a corrected row. */
  settledBy: Source | null;
}

export interface LayerView {
  layer: ChartLayer;
  name: string;
  /** The layer as it is now, in plain words. */
  value: string;
  /** The layer when the chart was first drawn, when a discussion changed it. */
  before: string | null;
  discussions: Discussion[];
  /** The state of its last discussion. */
  state: Thread["state"];
  /** How many held the accepted change, for an accepted layer. */
  accepted: number;
  /** Who proposed changes to it. */
  authors: ModelId[];
}

export interface ChartDissent extends DissentNote {
  keep: ModelId[];
  layer: ChartLayer;
  action: string;
  proposed: string | null;
}

export interface ChartView {
  answer: ChartAnswer;
  chart: Chart;
  origin: "web" | "user";
  title: string;
  caption: string;
  dimension: string;
  measure: string;
  rows: RowView[];
  /** The rows with a note, in the order of their numbers. */
  notes: RowView[];
  layers: LayerView[];
  dissent: ChartDissent[];
  /** The calculation of an upload in plain words. */
  calculation: string;
  /** The uploaded table, for a chart of the user's data. */
  upload: { columns: Column[]; rows: Record<string, CellValue>[] } | null;
  /** The data set of the drawing (the dates of the axis as local times). */
  data: Datum[];
  /** The spec of the drawing at a height in pixels. */
  spec: (height: number) => Record<string, unknown>;
  label: string;
}

const numberFormat = new Intl.NumberFormat(t.locale, { maximumFractionDigits: 2 });
const monthFormat = new Intl.DateTimeFormat(t.locale, { month: "long", year: "numeric" });
const dayFormat = new Intl.DateTimeFormat(t.locale, {
  day: "numeric",
  month: "long",
  year: "numeric",
});

export function formatNumber(value: number | null | undefined): string {
  return typeof value === "number" ? numberFormat.format(value) : "";
}

/** A key as a reader says it: a month or a day in words, anything else as it is. */
export function keyLabel(key: string): string {
  const m = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(key);
  if (!m) return key;
  if (!m[2]) return m[1] ?? key;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3] ?? 1));
  return m[3] ? dayFormat.format(date) : monthFormat.format(date);
}

/** A cell of the table: numbers and dates in the reader's way. */
export function cellText(value: unknown, temporal = false): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") {
    if (temporal) return monthFormat.format(new Date(value));
    return formatNumber(value);
  }
  if (value instanceof Date) return dayFormat.format(value);
  return typeof value === "string" ? keyLabel(value) : String(value);
}

/** The chart block of a version of the document, or null. */
export function chartBlock(snapshot: Snapshot | undefined): Chart | null {
  if (!snapshot) return null;
  for (const id of snapshot.order) {
    const b = snapshot.blocks[id];
    if (b?.kind === "chart") return b;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// The rows

function verdictOf(
  d: NonNullable<ChartAnswerRow["dispute"]>,
  v: NonNullable<ChartAnswerRow["dispute"]>["values"][number],
): ValueView["verdict"] {
  if (d.state === "open") return "checking";
  if (d.winner === v.id) return "held";
  if (v.checkers === 0) return "unchecked";
  return v.holds === 0 ? "failed" : "partial";
}

function valuesOf(row: ChartAnswerRow): ValueView[] {
  const d = row.dispute;
  if (d)
    return d.values.map((v) => ({
      value: v.value,
      text: formatNumber(v.value),
      source: v.source,
      quote: v.quote,
      support: [...v.support],
      verdict: verdictOf(d, v),
      holds: v.holds,
      checkers: v.checkers,
    }));
  const main = typeof row.values.value === "number" ? row.values.value : null;
  return [
    { value: main, source: row.source, quote: row.quote, support: row.support },
    ...row.alternatives,
  ].map((v) => ({
    value: v.value,
    text: formatNumber(v.value),
    source: v.source,
    quote: v.quote,
    support: [...v.support],
    verdict: "unchecked" as const,
    holds: 0,
    checkers: 0,
  }));
}

function kindOf(row: ChartAnswerRow, changed: boolean): RowKind {
  switch (row.status) {
    case "upload":
      return "upload";
    case "agreed":
      return "agreed";
    case "held":
      return changed || (row.dispute?.values.length ?? 0) > 1 ? "corrected" : "confirmed";
    case "unsettled":
      return "range";
    case "disputed":
      return "checking";
    default:
      return "lone"; // single, unverified
  }
}

/** The ends of a row's values: the range of an unsettled row. */
function ends(values: readonly ValueView[]): { low: number; high: number } | null {
  const numbers = values.flatMap((v) => (v.value === null ? [] : [v.value]));
  if (numbers.length < 2) return null;
  return { low: Math.min(...numbers), high: Math.max(...numbers) };
}

function rowsOf(answer: ChartAnswer, first: Chart | null): RowView[] {
  let notes = 0;
  return answer.rows.map((row): RowView => {
    const value = typeof row.values.value === "number" ? row.values.value : null;
    const before = first?.data.rows.find((r) => r.key === row.key)?.values.value;
    const changed = typeof before === "number" && value !== null && before !== value;
    const kind = kindOf(row, changed);
    const values = valuesOf(row);
    const range = kind === "range" ? ends(values) : null;
    const who = t.modelNames(row.support);
    const now = formatNumber(value);
    let noteText: string | null = null;
    if (kind === "corrected")
      noteText = changed
        ? t.chart.notes.corrected(formatNumber(before as number), now)
        : t.chart.notes.settled(now);
    else if (kind === "range" && range)
      noteText = t.chart.notes.range(formatNumber(range.low), formatNumber(range.high));
    else if (kind === "checking") noteText = t.chart.notes.checking;
    else if (kind === "lone")
      noteText =
        row.status === "unverified"
          ? t.chart.notes.loneUnverified(who)
          : row.dispute?.state === "open"
            ? t.chart.notes.loneChecking(who)
            : t.chart.notes.loneUnchecked(who);
    return {
      key: row.key,
      label: keyLabel(row.key),
      kind,
      value: range ? null : value,
      text: range ? t.chart.range(formatNumber(range.low), formatNumber(range.high)) : now,
      source: row.source,
      quote: row.quote,
      support: [...row.support],
      note: noteText === null ? null : ++notes,
      noteText,
      values,
      settledBy: kind === "corrected" ? row.source : null,
    };
  });
}

/** The data set of a web chart: the fields of `chartSpec`, the note of a row and where it goes. */
function webData(rows: readonly RowView[], chart: Chart): Datum[] {
  return rows.map((r) => {
    const range = r.kind === "range" ? ends(r.values) : null;
    return {
      key: r.key,
      value: r.value,
      low: range?.low ?? null,
      high: range?.high ?? null,
      source: chart.data.rows.find((x) => x.key === r.key)?.source ?? null,
      note: r.note === null ? null : String(r.note),
      at: r.value ?? range?.high ?? null,
    };
  });
}

// ---------------------------------------------------------------------------------------------
// The layers and the calculation

const quoted = (field: unknown) => t.chart.calc.quoted(String(field));

function byFields(fields: unknown): string {
  return Array.isArray(fields) ? t.list(fields.map(quoted)) : "";
}

function summaryOf(op: unknown): string {
  return t.chart.calc.ops[String(op)] ?? t.chart.calc.otherOp;
}

/** One transform in plain words. */
function transformText(step: unknown): string {
  const c = t.chart.calc;
  if (!step || typeof step !== "object") return c.other;
  const s = step as Record<string, unknown>;
  if (Array.isArray(s.aggregate)) {
    const by = byFields(s.groupby);
    return s.aggregate
      .map((a) => {
        const { op, field } = (a ?? {}) as { op?: unknown; field?: unknown };
        return c.aggregate(summaryOf(op), typeof field === "string" ? field : null, by);
      })
      .join(", ");
  }
  if ("filter" in s) return c.filter;
  if (typeof s.calculate === "string") return c.calculate(String(s.as ?? ""));
  if (typeof s.timeUnit === "string")
    return c.timeUnit(String(s.field ?? ""), c.units[s.timeUnit] ?? c.otherUnit);
  if ("bin" in s) return c.bin(String(s.field ?? ""));
  if (Array.isArray(s.window)) {
    const w = (s.window[0] ?? {}) as { op?: unknown; field?: unknown; as?: unknown };
    const frame = s.frame as unknown[] | undefined;
    if (w.op === "sum" && (!frame || (frame[0] === null && frame[1] === 0)))
      return c.cumulative(String(w.field ?? ""));
    return c.window(String(w.as ?? ""));
  }
  if (Array.isArray(s.joinaggregate)) {
    const j = (s.joinaggregate[0] ?? {}) as { op?: unknown; field?: unknown };
    return c.joinaggregate(summaryOf(j.op), String(j.field ?? ""));
  }
  if (Array.isArray(s.fold)) return c.fold(byFields(s.fold));
  if (typeof s.pivot === "string") return c.pivot(s.pivot);
  if (typeof s.stack === "string") return c.stack(s.stack);
  if (typeof s.regression === "string" || typeof s.loess === "string")
    return c.trend(String(s.regression ?? s.loess), String(s.on ?? ""));
  return c.other;
}

/** A list of transforms in plain words: "la suma de «ventas» por «sucursal»". */
export function describeTransform(list: readonly unknown[]): string {
  if (list.length === 0) return t.chart.calc.none;
  return t.chart.calc.sequence(list.map(transformText));
}

function markName(mark: unknown): string {
  return t.chart.marks[String(mark)] ?? t.chart.otherMark;
}

/** A layer of a chart in plain words. */
export function layerText(chart: Chart, layer: ChartLayer): string {
  switch (layer) {
    case "title":
      return chart.title || t.chart.layers.empty;
    case "caption":
      return chart.caption || t.chart.layers.empty;
    case "transform":
      return describeTransform(chart.transform);
    case "encoding": {
      const axes = ["x", "y"].flatMap((ch) => {
        const def = chart.encoding[ch] as { title?: unknown; field?: unknown } | undefined;
        const title = typeof def?.title === "string" ? def.title : null;
        return title ? [t.chart.axis(t.chart.axes[ch] ?? ch, title)] : [];
      });
      return [t.chart.kind(markName(chart.mark)), ...axes].join(" ");
    }
    default:
      return "";
  }
}

/** What a proposal on a layer of a chart changes, in plain words, and its new text if any. */
export function patchText(s: Pick<Suggestion, "target" | "text">): {
  action: string;
  proposed: string | null;
} {
  const p = t.chart.patch;
  const value = readValue(s.text);
  const text = typeof value === "string" ? value : null;
  const path = splitPath(s.target.path ?? "");
  switch (s.target.layer) {
    case "title":
      return { action: p.title, proposed: text ?? s.text };
    case "caption":
      return { action: p.caption, proposed: text ?? s.text };
    case "transform":
      return {
        action: p.transform,
        proposed: Array.isArray(value)
          ? describeTransform(value)
          : value === null
            ? null
            : transformText(value),
      };
    case "data":
      return { action: p.data(keyLabel(path.join("."))), proposed: s.text };
    default: {
      if (path[0] === "mark") return { action: p.mark(markName(value)), proposed: null };
      const channel = path[1];
      if (!channel) return { action: p.encoding, proposed: null };
      if (path[2] === "title" && path.length === 3 && text !== null && p.axisNames[channel])
        return { action: p.axisTitle(p.axisNames[channel] ?? channel), proposed: text };
      return { action: p.channel(p.parts[channel] ?? p.otherPart), proposed: null };
    }
  }
}

const VOTED: ChartLayer[] = ["encoding", "title", "caption", "transform"];

function layerOfThread(thread: Thread): ChartLayer | null {
  const layer = thread.lockKey.split("/")[1] as ChartLayer | undefined;
  return layer && (VOTED as string[]).includes(layer) ? layer : null;
}

function layersOf(view: RunView, chart: Chart, first: Chart | null): LayerView[] {
  const threads = Object.values(view.threads).filter((th) => th.block === chart.id);
  return VOTED.flatMap((layer): LayerView[] => {
    const own = threads.filter((th) => layerOfThread(th) === layer);
    const last = own.at(-1);
    if (!last) return [];
    const discussions = own.map((th) => discussionOf(view, th));
    const changed =
      first !== null &&
      JSON.stringify(layerOf(first, layer)) !== JSON.stringify(layerOf(chart, layer));
    const accepted = own.findLast((th) => th.state === "accepted");
    return [
      {
        layer,
        name: t.chart.layers.names[layer],
        value: layerText(chart, layer),
        before: changed && accepted && first ? layerText(first, layer) : null,
        discussions,
        state: last.state,
        accepted: accepted?.tally?.for.length ?? 0,
        authors: MODELS.filter((m) =>
          discussions.some((d) => d.alternatives.some((s) => s.author === m)),
        ),
      },
    ];
  });
}

/** The fields the first layer draws, with their titles: the columns of the table of an upload. */
export function drawnColumns(chart: Chart): { field: string; title: string; temporal: boolean }[] {
  const out: { field: string; title: string; temporal: boolean }[] = [];
  for (const channel of ["x", "y", "xOffset", "color", "theta", "column", "row", "size"]) {
    const def = chart.encoding[channel] as
      | {
          field?: unknown;
          aggregate?: unknown;
          timeUnit?: unknown;
          title?: unknown;
          type?: unknown;
        }
      | undefined;
    if (!def || typeof def.field !== "string") continue;
    const prefix =
      typeof def.aggregate === "string"
        ? `${def.aggregate}_`
        : typeof def.timeUnit === "string"
          ? `${def.timeUnit}_`
          : "";
    const field = `${prefix}${def.field}`;
    if (out.some((c) => c.field === field)) continue;
    out.push({
      field,
      title: typeof def.title === "string" ? def.title : def.field,
      temporal: def.type === "temporal",
    });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// The chart of a version

/**
 * What the page shows of the chart of a chart run, at its latest version or at `version` (the
 * history). The discussions and the dissent describe the run as it stands. Null before the chart
 * exists, or for a text answer.
 */
export function chartViewOf(view: RunView, version?: number): ChartView | null {
  const answer = selectChart(view, version);
  if (!answer) return null;
  const snapshot = view.snapshots.find((s) => s.version === answer.version);
  const chart = chartBlock(snapshot);
  if (!chart) return null;
  const first = chartBlock(view.snapshots[0]);
  const rows = answer.origin === "web" ? rowsOf(answer, first) : [];
  const dates = temporalFields(chart.encoding);
  const data =
    answer.origin === "web"
      ? withLocalDates(webData(rows, chart), dates)
      : withLocalDates(
          chart.data.rows.map((r) => ({ ...r.values })),
          dates,
        );
  const dissent = answer.dissent.flatMap((d): ChartDissent[] => {
    const thread = view.threads[d.thread];
    const layer = thread ? layerOfThread(thread) : null;
    const s = view.suggestions[d.suggestion];
    if (!layer || !s) return [];
    const held = view.positions[d.thread] ?? {};
    return [
      {
        ...d,
        keep: MODELS.filter((m) => held[m] === "keep"),
        layer,
        ...patchText(s),
      },
    ];
  });
  const title = chart.title || t.chart.untitled;
  return {
    answer,
    chart,
    origin: answer.origin,
    title,
    caption: chart.caption,
    dimension: chart.brief.dimensions[0] ?? "",
    measure: chart.brief.measures[0] ?? "",
    rows,
    notes: rows.filter((r) => r.note !== null),
    layers: layersOf(view, chart, first),
    dissent,
    calculation: describeTransform(chart.transform),
    upload:
      answer.origin === "user"
        ? { columns: chart.data.columns, rows: chart.data.rows.map((r) => ({ ...r.values })) }
        : null,
    data,
    spec: (height) => browserSpec(chart, height),
    label: t.chart.label(title),
  };
}

/** The rows of the last version by how they ended: the stage line of a finished chart run. */
export function chartCounts(view: RunView) {
  const answer = selectChart(view);
  const rows = answer ? rowsOf(answer, chartBlock(view.snapshots[0])) : [];
  const count = (...kinds: RowKind[]) => rows.filter((r) => kinds.includes(r.kind)).length;
  return {
    origin: answer?.origin ?? "web",
    rows: rows.length,
    agreed: count("agreed"),
    settled: count("corrected", "confirmed"),
    ranges: count("range"),
    lone: count("lone"),
    dissent: new Set(answer?.dissent.map((d) => d.thread)).size,
  };
}

/** Points in discussion in a chart run: open discussions and rows being checked. */
export function chartOpenPoints(view: RunView): number {
  const threads = Object.values(view.threads).filter((th) => th.state === "open").length;
  const disputes = Object.values(view.disputes).filter((d) => d.state === "open").length;
  if (threads + disputes > 0) return threads + disputes;
  const chart = chartBlock(view.snapshots.at(-1));
  return (
    chart?.data.rows.filter((r) => r.status === "single" || r.status === "disputed").length ?? 0
  );
}

// ---------------------------------------------------------------------------------------------
// The history of the chart

export type ChartChange =
  | { kind: "row"; text: string }
  | { kind: "layer"; name: string; by: ModelId | null; before: string; after: string };

export interface ChartStep {
  version: number;
  label: string;
  what: string;
  changes: ChartChange[];
}

function rowValueText(chart: Chart, key: string): string {
  const row = chart.data.rows.find((r) => r.key === key);
  if (!row) return "";
  const values = [row.values.value, ...row.alternatives.map((a) => a.values.value)].filter(
    (v): v is number => typeof v === "number",
  );
  if (row.status === "unsettled" && values.length > 1)
    return t.chart.range(formatNumber(Math.min(...values)), formatNumber(Math.max(...values)));
  return formatNumber(typeof row.values.value === "number" ? row.values.value : null);
}

function rowChanges(before: Chart, after: Chart): string[] {
  if (after.data.origin !== "web") return [];
  const out: string[] = [];
  const h = t.chart.history.row;
  for (const row of after.data.rows) {
    const label = keyLabel(row.key);
    const old = before.data.rows.find((r) => r.key === row.key);
    const now = rowValueText(after, row.key);
    if (!old) {
      out.push(h.added(label, now));
      continue;
    }
    if (old.status === row.status && old.values.value === row.values.value) continue;
    const was = rowValueText(before, row.key);
    const values = [row.values.value, ...row.alternatives.map((a) => a.values.value)].filter(
      (v): v is number => typeof v === "number",
    );
    if (row.status === "unsettled" && values.length > 1)
      out.push(
        h.range(label, formatNumber(Math.min(...values)), formatNumber(Math.max(...values))),
      );
    else if (row.status === "held")
      out.push(was !== now ? h.corrected(label, was, now) : h.confirmed(label, now));
    else if (row.status === "unverified") out.push(h.lone(label));
    else if (was !== now) out.push(h.changed(label, was, now));
  }
  for (const old of before.data.rows)
    if (!after.data.rows.some((r) => r.key === old.key)) out.push(h.removed(keyLabel(old.key)));
  return out;
}

/**
 * The steps of the chart, oldest first: the chart of the merged data, then each version after it
 * with what changed: the rows the sources settled, and the layers the votes changed, by whom.
 */
export function chartHistoryOf(view: RunView): ChartStep[] {
  const steps: ChartStep[] = [];
  view.snapshots.forEach((snapshot, index) => {
    const chart = chartBlock(snapshot);
    if (!chart) return;
    const cause = view.versions[index] ?? {
      version: snapshot.version,
      cause: index === 0 ? "merge" : "round",
      threads: [],
      round: null,
    };
    const before = index > 0 ? chartBlock(view.snapshots[index - 1]) : null;
    const changes: ChartChange[] = [];
    let rowsChanged = 0;
    if (before) {
      const rows = rowChanges(before, chart);
      rowsChanged = rows.length;
      changes.push(...rows.map((text) => ({ kind: "row" as const, text })));
      for (const layer of VOTED) {
        if (JSON.stringify(layerOf(before, layer)) === JSON.stringify(layerOf(chart, layer)))
          continue;
        const thread = cause.threads
          .map((id) => view.threads[id])
          .find((th) => th && layerOfThread(th) === layer && th.state === "accepted");
        const by = thread?.winner ? (view.suggestions[thread.winner]?.author ?? null) : null;
        changes.push({
          kind: "layer",
          name: t.chart.layers.names[layer],
          by,
          before: layerText(before, layer),
          after: layerText(chart, layer),
        });
      }
    }
    const authors = MODELS.filter((m) => changes.some((c) => c.kind === "layer" && c.by === m));
    const layerChanges = changes.filter((c) => c.kind === "layer").length;
    const h = t.chart.history;
    const label =
      cause.cause === "merge"
        ? t.history.steps.merge
        : cause.cause === "render"
          ? h.steps.render
          : cause.round === null
            ? h.steps.sources
            : t.history.steps.round(cause.round);
    const what =
      cause.cause === "merge"
        ? h.what.merge(view.briefs.length || 4)
        : cause.cause === "render"
          ? h.what.render
          : rowsChanged > 0 && authors.length > 0
            ? h.what.both(rowsChanged, t.modelNames(authors), layerChanges)
            : rowsChanged > 0
              ? h.what.sources(rowsChanged)
              : authors.length > 0
                ? t.history.what.round(t.modelNames(authors), layerChanges)
                : h.what.none;
    steps.push({ version: snapshot.version, label, what, changes });
  });
  return steps;
}
