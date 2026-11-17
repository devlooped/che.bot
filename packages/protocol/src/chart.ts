import { parseNumber } from "./csv.ts";
import {
  type CellValue,
  type Chart,
  type ChartLayer,
  type ChartOrigin,
  type Column,
  MODELS,
  type ModelId,
  type Row,
} from "./model.ts";
import { clone } from "./util.ts";

// Charts as data: the layers of a chart block, the checks of a patch on a layer, the theme that no
// model may change, and the Vega-Lite spec composed from the layers. Pure: the reducer, the
// renderer and the browser all compose the same spec from the same block.

/** The fields of a web dataset: one dimension and one measure; `low` and `high` draw a range. */
export const WEB_FIELDS = { key: "key", value: "value", low: "low", high: "high" } as const;

/** The size of the rendered chart; the browser may draw it wider. */
export const CHART_SIZE = { width: 640, height: 360 };

/**
 * The fixed theme of the app: colors and fonts are never the models'. `stripTheme` removes them
 * from every spec and patch; `chartSpec` adds this one.
 */
export const CHART_THEME = {
  background: "#f9fbfb",
  font: "Instrument Sans Variable, system-ui, sans-serif",
  view: { stroke: null },
  axis: {
    labelColor: "#3a4652",
    titleColor: "#17202b",
    domainColor: "#8b98a2",
    tickColor: "#8b98a2",
    gridColor: "#cbd3d8",
    labelFontSize: 12,
    titleFontSize: 12,
  },
  legend: { labelColor: "#3a4652", titleColor: "#17202b" },
  title: { color: "#17202b", fontSize: 15, anchor: "start" },
  range: { category: ["#2d52c7", "#b0263f", "#0b7a5c", "#94590a", "#56616c", "#7a3fb5"] },
  mark: { color: "#2d52c7" },
  rule: { color: "#a3122d" },
} as const;

/** Marks a model may choose. */
export const MARKS = [
  "arc",
  "area",
  "bar",
  "boxplot",
  "circle",
  "errorband",
  "errorbar",
  "line",
  "point",
  "rect",
  "rule",
  "square",
  "text",
  "tick",
  "trail",
] as const;

/** Encoding channels a model may set; links (`href`) and the theme are not among them. */
export const CHANNELS = new Set([
  "x",
  "y",
  "x2",
  "y2",
  "xOffset",
  "yOffset",
  "color",
  "fill",
  "stroke",
  "opacity",
  "fillOpacity",
  "strokeOpacity",
  "strokeWidth",
  "strokeDash",
  "size",
  "shape",
  "angle",
  "theta",
  "theta2",
  "radius",
  "radius2",
  "text",
  "tooltip",
  "detail",
  "order",
  "row",
  "column",
  "facet",
]);

/**
 * Transforms a model may use. `lookup` (it carries inline data) and `impute` (it types values) are
 * not among them; a `calculate` must read `datum` and may not overwrite a field of the dataset.
 */
export const TRANSFORMS = [
  "aggregate",
  "bin",
  "calculate",
  "filter",
  "fold",
  "joinaggregate",
  "pivot",
  "timeUnit",
  "window",
  "stack",
  "regression",
  "loess",
] as const;

const COLOR_CHANNELS = new Set(["color", "fill", "stroke"]);
const THEME_KEYS = new Set([
  "config",
  "background",
  "padding",
  "autosize",
  "usermeta",
  "$schema",
  "width",
  "height",
  "cornerRadius",
]);
/**
 * Keys that carry data into a spec: refused, the data comes from the dataset of the chart. `datum`
 * in an encoding is a constant value typed into the chart.
 */
const DATA_KEYS = new Set(["data", "datasets", "values", "url", "datum"]);

/** The theme taken out of a value: what is left, and the paths removed. */
export function stripTheme(
  value: unknown,
  path: readonly string[],
): { value: unknown; stripped: string[] } {
  const stripped: string[] = [];
  const walk = (node: unknown, at: string[]): unknown => {
    if (Array.isArray(node)) return node.map((v, i) => walk(v, [...at, String(i)]));
    if (node === null || typeof node !== "object") return node;
    const out: Record<string, unknown> = {};
    const channelLevel = at.length === 1 && at[0] === "encoding";
    const parent = at.at(-1) ?? "";
    const inColorChannel = at.length === 2 && at[0] === "encoding" && COLOR_CHANNELS.has(parent);
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      const theme =
        THEME_KEYS.has(k) ||
        /font/i.test(k) ||
        (/color$/i.test(k) && !(channelLevel && COLOR_CHANNELS.has(k))) ||
        (!channelLevel && (k === "fill" || k === "stroke")) ||
        ((k === "scheme" || k === "range") && parent === "scale") ||
        (k === "value" && inColorChannel);
      if (theme) {
        stripped.push([...at, k].join("."));
        continue;
      }
      const child = walk(v, [...at, k]);
      // an object left empty by the stripping goes too (a color channel that only had a value)
      const emptied =
        child !== null &&
        typeof child === "object" &&
        !Array.isArray(child) &&
        Object.keys(child).length === 0 &&
        Object.keys(v as object).length > 0;
      if (!emptied) out[k] = child;
    }
    return out;
  };
  return { value: walk(value, [...path]), stripped };
}

/** Whether a value carries data (inline values, a URL, a named dataset). */
export function carriesData(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(carriesData);
  if (value === null || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(
    ([k, v]) => DATA_KEYS.has(k) || carriesData(v),
  );
}

export type PatchDropReason =
  | "user_data" // a patch on the data layer of a chart from user data
  | "inline_data" // a value that carries data
  | "theme_only" // nothing left once the theme is stripped
  | "unknown_path" // a path that is not allowed in the layer
  | "invalid_value" // not JSON, or not the type the path takes
  | "transform_not_allowed"
  | "no_change"
  | "render_failed";

export type CheckedPatch =
  | { ok: true; value: unknown; stripped: string[] }
  | { ok: false; why: PatchDropReason; detail: string };

/** Reads a patch value: JSON when it parses, else the raw text (a title, a caption). */
export function readValue(text: string): unknown {
  const t = text.trim();
  try {
    return JSON.parse(t);
  } catch {
    return t;
  }
}

/** Splits a path inside a layer: "encoding.x.axis.title" → ["encoding", "x", "axis", "title"]. */
export function splitPath(path: string): string[] {
  const t = path.trim();
  return t === "" ? [] : t.split(".").map((p) => p.trim());
}

/**
 * The checks of a patch on a layer of a chart (not the data layer of web charts, which is settled
 * by source: see `checkDataPatch`). Allowed paths per layer:
 * - title, caption: "" (the whole text);
 * - transform: "" (the whole list) or "<index>" (one transform; the index after the last adds one);
 * - encoding: "mark", "encoding", or "encoding.<channel>[.<property>...]" (null removes it).
 * The theme is stripped from the value; a value that carries data is refused; a patch that leaves
 * the layer as it is, is dropped.
 */
export function checkPatch(
  chart: Chart,
  patch: { layer: ChartLayer; path: string; value: string },
): CheckedPatch {
  const fail = (why: PatchDropReason, detail: string): CheckedPatch => ({ ok: false, why, detail });
  if (patch.layer === "data") {
    return chart.data.origin === "user"
      ? fail("user_data", "The data of an upload is not the models' to change.")
      : fail("unknown_path", "A data patch names a row and a source (see checkDataPatch).");
  }
  const raw = readValue(patch.value);
  if (carriesData(raw)) return fail("inline_data", "The value carries data.");
  const path = splitPath(patch.path);
  let value: unknown = raw;
  let stripped: string[] = [];

  if (patch.layer === "title" || patch.layer === "caption") {
    if (path.length > 0) return fail("unknown_path", `${patch.layer} takes the path "".`);
    const text = (typeof raw === "string" ? raw : patch.value).trim();
    if (text === "") return fail("invalid_value", `${patch.layer} is a text.`);
    const max = patch.layer === "title" ? 120 : 600;
    if (text.length > max)
      return fail("invalid_value", `${patch.layer} has at most ${max} characters.`);
    value = text;
  } else if (patch.layer === "transform") {
    if (path.length > 1 || (path.length === 1 && !/^\d+$/.test(path[0] ?? "")))
      return fail("unknown_path", 'transform takes the path "" or an index.');
    const index = path.length === 1 ? Number(path[0]) : null;
    if (index !== null && index > chart.transform.length)
      return fail("unknown_path", `transform has ${chart.transform.length} steps.`);
    if (index !== null && raw === null) {
      if (index >= chart.transform.length)
        return fail("unknown_path", `transform has ${chart.transform.length} steps.`);
      return { ok: true, value: null, stripped: [] };
    }
    const list = index === null ? raw : [raw];
    if (!Array.isArray(list)) return fail("invalid_value", "transform is a list.");
    const stripResult = stripTheme(list, ["transform"]);
    stripped = stripResult.stripped;
    const problem = transformProblem(stripResult.value as unknown[], chart);
    if (problem) return fail("transform_not_allowed", problem);
    value = index === null ? stripResult.value : (stripResult.value as unknown[])[0];
  } else {
    const [root, channel, ...rest] = path;
    if (root === "mark" && path.length === 1) {
      const mark = typeof raw === "object" && raw !== null ? (raw as { type?: unknown }).type : raw;
      if (typeof mark !== "string" || !(MARKS as readonly string[]).includes(mark))
        return fail("invalid_value", `mark is one of ${MARKS.join(", ")}.`);
      value = mark;
    } else if (root === "encoding") {
      if (channel !== undefined && !CHANNELS.has(channel))
        return fail("unknown_path", `${channel} is not an encoding channel.`);
      const full = ["encoding", ...(channel ? [channel] : []), ...rest];
      if (stripTheme(nest(full, 1), []).stripped.length > 0)
        return fail("theme_only", `${patch.path} is the theme of the app.`);
      if (channel === undefined && (raw === null || typeof raw !== "object" || Array.isArray(raw)))
        return fail("invalid_value", "encoding is an object.");
      if (raw === null) value = null;
      else {
        const s = stripTheme(raw, full);
        stripped = s.stripped;
        value = s.value;
        if (stripped.length > 0 && isEmpty(value))
          return fail("theme_only", "Only the theme of the app was changed.");
      }
    } else return fail("unknown_path", 'encoding takes "mark" or "encoding[.<channel>...]".');
  }

  const after = patchChart(chart, patch.layer, patch.path, value);
  if (JSON.stringify(layerOf(after, patch.layer)) === JSON.stringify(layerOf(chart, patch.layer)))
    return fail("no_change", "The layer stays as it is.");
  return { ok: true, value, stripped };
}

function nest(path: readonly string[], value: unknown): unknown {
  return path.reduceRight<unknown>((acc, k) => ({ [k]: acc }), value);
}

function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.values(value).every(isEmpty);
  return false;
}

/** Why a list of transforms is not allowed, or null. */
export function transformProblem(
  list: readonly unknown[],
  chart: Pick<Chart, "data">,
): string | null {
  const columns = new Set(dataFields(chart.data.origin, chart.data.columns));
  for (const t of list) {
    if (t === null || typeof t !== "object" || Array.isArray(t)) return "A transform is an object.";
    const op = TRANSFORMS.find((name) => name in (t as object));
    if (!op) return `Only ${TRANSFORMS.join(", ")} are allowed.`;
    if (op === "calculate") {
      const { calculate, as } = t as { calculate?: unknown; as?: unknown };
      if (typeof calculate !== "string" || !/\bdatum\b/.test(calculate))
        return "A calculate reads the data (datum).";
      if (typeof as !== "string" || columns.has(as))
        return "A calculate makes a new field; it never overwrites one of the data.";
    }
  }
  return null;
}

/**
 * The fields a list of transforms makes (`as` of calculate, aggregate, window, bin, timeUnit, fold,
 * joinaggregate). A pivot makes fields named by the values of a column: `open` says that any name
 * may exist.
 */
export function transformFields(list: readonly unknown[]): { names: Set<string>; open: boolean } {
  const names = new Set<string>();
  let open = false;
  const add = (v: unknown) => {
    if (typeof v === "string") names.add(v);
    else if (Array.isArray(v)) for (const x of v) add(x);
  };
  for (const t of list) {
    if (!t || typeof t !== "object") continue;
    const o = t as Record<string, unknown>;
    if ("pivot" in o) open = true;
    if ("fold" in o) add(o.as ?? ["key", "value"]);
    else add(o.as);
    for (const k of ["aggregate", "window", "joinaggregate"]) {
      const ops = o[k];
      if (Array.isArray(ops)) for (const op of ops) add((op as { as?: unknown } | null)?.as);
    }
  }
  return { names, open };
}

/** The fields of the dataset a spec sees. */
export function dataFields(origin: ChartOrigin, columns: readonly Column[]): string[] {
  return origin === "web" ? Object.values(WEB_FIELDS) : columns.map((c) => c.name);
}

/** The JSON value of a layer: what a patch changes and what a thread locks. */
export function layerOf(chart: Chart, layer: ChartLayer): unknown {
  switch (layer) {
    case "data":
      return chart.data.rows;
    case "transform":
      return chart.transform;
    case "encoding":
      return { mark: chart.mark, encoding: chart.encoding };
    case "title":
      return chart.title;
    case "caption":
      return chart.caption;
  }
}

/** A new chart with `value` set at `path` of `layer` (a checked value; null removes the path). */
export function patchChart(chart: Chart, layer: ChartLayer, path: string, value: unknown): Chart {
  const next = clone(chart);
  const keys = splitPath(path);
  switch (layer) {
    case "title":
      next.title = String(value);
      break;
    case "caption":
      next.caption = String(value);
      break;
    case "transform":
      if (keys.length === 0) next.transform = clone(value as unknown[]);
      else if (value === null) next.transform.splice(Number(keys[0]), 1);
      else next.transform[Number(keys[0])] = clone(value);
      break;
    case "encoding":
      if (keys[0] === "mark") next.mark = String(value);
      else if (keys.length === 1) next.encoding = clone(value as Record<string, unknown>);
      else setPath(next.encoding, keys.slice(1), value);
      break;
    case "data":
      break;
  }
  return next;
}

function setPath(target: Record<string, unknown>, keys: readonly string[], value: unknown) {
  let node = target;
  for (const k of keys.slice(0, -1)) {
    const child = node[k];
    if (child === null || typeof child !== "object" || Array.isArray(child)) node[k] = {};
    node = node[k] as Record<string, unknown>;
  }
  const last = keys.at(-1) as string;
  if (value === null) delete node[last];
  else node[last] = clone(value);
}

// ---------------------------------------------------------------------------------------------
// Numbers of the web: what a value is, when two values are the same, what a quote states.

/** A value as a model writes it: digits, a dot for decimals; also "2,7" and "2.7 %". Strict. */
export function readModelNumber(text: string): number | null {
  const t = text
    .trim()
    .replace(/\s*(%|‰)$/, "")
    .replace(/−/g, "-");
  if (/^[-+]?\d+(\.\d+)?$/.test(t)) return Number(t);
  if (/^[-+]?\d+,\d+$/.test(t)) return Number(t.replace(",", "."));
  return parseNumber(t);
}

function decimals(n: number): number {
  const s = String(n);
  if (s.includes("e")) return 0;
  return s.includes(".") ? (s.split(".")[1]?.length ?? 0) : 0;
}

/**
 * Two values are the same when they are equal, or when both have decimals and they are equal at
 * the coarser precision of the two (2.7 and 2.72). An integer is never the same as a rounded one
 * (3 and 3.4, 3,100,000 and 3,121,707 are different values: the sources settle them).
 */
export function sameValue(a: number, b: number): boolean {
  if (a === b) return true;
  const d = Math.min(decimals(a), decimals(b));
  if (d === 0) return false;
  const f = 10 ** d;
  return Math.round(a * f) === Math.round(b * f);
}

const MULTIPLIERS: [RegExp, number][] = [
  [/^(mil millones|billion|bn)\b/i, 1e9],
  [/^(millones|millón|millon|million|mill\.?|mm|m)\b/i, 1e6],
  [/^(mil|thousand|k)\b/i, 1e3],
];

/** Every number a text states, with both readings of an ambiguous separator and its multiplier. */
export function numbersIn(text: string): number[] {
  const out: number[] = [];
  const re = /[-−]?\d[\d.,   ]*\d|\d/g;
  for (const m of text.matchAll(re)) {
    const raw = m[0].replace(/[   ]+$/, "");
    const after = text.slice((m.index ?? 0) + m[0].length).trimStart();
    const mult = MULTIPLIERS.find(([r]) => r.test(after))?.[1] ?? 1;
    const readings = new Set<number>();
    const lenient = parseNumber(raw);
    if (lenient !== null) readings.add(lenient);
    const plain = raw.replace(/[   ]/g, "");
    // both readings of one separator: "3,121" is 3121 or 3.121
    if (/^[-−]?\d+[.,]\d+$/.test(plain))
      readings.add(Number(plain.replace(",", ".").replace("−", "-")));
    for (const r of readings) {
      out.push(r);
      if (mult !== 1) out.push(r * mult);
    }
  }
  return out;
}

/**
 * Whether a quote states a value: one of its numbers is the value, at the precision the quote
 * writes it (a quote's "3,1 millones" states 3,100,000 and 3,121,707 alike only if the quote is
 * the coarser one: the value rounds to it). The code half of "the source holds up".
 */
export function quoteStates(value: number, quote: string): boolean {
  for (const n of numbersIn(quote)) {
    if (sameValue(value, n) || roundsTo(value, n)) return true;
  }
  return false;
}

/** Whether `value` rounded to the significant digits of `written` is `written` (3,121,707 → 3.1e6). */
function roundsTo(value: number, written: number): boolean {
  if (written === 0 || value === 0) return false;
  const digits = significant(written);
  if (digits < 2) return false;
  return Number(value.toPrecision(digits)) === Number(written.toPrecision(digits));
}

function significant(n: number): number {
  const s = Math.abs(n).toString().replace(".", "").replace(/^0+/, "").replace(/0+$/, "");
  return Math.max(1, s.length);
}

// ---------------------------------------------------------------------------------------------
// The spec of a chart.

/** The dimension of a web chart is temporal when its keys are ISO dates (2026, 2026-03, 2026-03-31). */
export function temporalKeys(rows: readonly Row[]): boolean {
  return rows.length > 0 && rows.every((r) => /^\d{4}(-\d{2}(-\d{2})?)?$/.test(r.key));
}

/** The rows a spec draws: web rows as { key, value, low, high, source }, uploaded rows as they are. */
export function dataValues(chart: Chart): Record<string, CellValue>[] {
  if (chart.data.origin === "user") return chart.data.rows.map((r) => ({ ...r.values }));
  return chart.data.rows.map((r) => {
    const values = [r.values.value, ...r.alternatives.map((a) => a.values.value)].filter(
      (v): v is number => typeof v === "number",
    );
    const range = r.status === "unsettled" && values.length > 1;
    return {
      key: r.key,
      value: range ? null : (r.values.value ?? null),
      low: range ? Math.min(...values) : null,
      high: range ? Math.max(...values) : null,
      source: r.source,
    };
  });
}

/**
 * The full Vega-Lite spec of a chart: its data, its layers and the app's theme. Web rows whose value
 * stayed unsettled have no value and a `low`-`high` range, drawn by a rule over the dimension.
 */
export function chartSpec(
  chart: Chart,
  options: { theme?: boolean } = {},
): Record<string, unknown> {
  const values = dataValues(chart);
  const main = { mark: chart.mark, encoding: clone(chart.encoding) };
  const ranges = chart.data.origin === "web" && values.some((v) => v.low !== null);
  const spec: Record<string, unknown> = {
    $schema: "https://vega.github.io/schema/vega-lite/v6.json",
    width: CHART_SIZE.width,
    height: CHART_SIZE.height,
    ...(chart.title ? { title: chart.title } : {}),
    data: { values },
    ...(chart.transform.length > 0 ? { transform: clone(chart.transform) } : {}),
  };
  const range = ranges ? rangeLayer(chart.encoding) : null;
  if (range) spec.layer = [main, range];
  else Object.assign(spec, main);
  if (options.theme !== false) spec.config = clone(CHART_THEME);
  return spec;
}

/** A rule from `low` to `high` along the channel that draws `value`, at the dimension of the row. */
function rangeLayer(encoding: Record<string, unknown>): Record<string, unknown> | null {
  const field = (ch: string) => (encoding[ch] as { field?: unknown } | undefined)?.field;
  const measure = ["y", "x"].find((ch) => field(ch) === WEB_FIELDS.value);
  const dimension = ["x", "y"].find((ch) => field(ch) === WEB_FIELDS.key);
  if (!measure || !dimension) return null;
  return {
    mark: { type: "rule", strokeWidth: 3 },
    encoding: {
      [dimension]: clone(encoding[dimension]),
      [measure]: { field: WEB_FIELDS.low, type: "quantitative" },
      [`${measure}2`]: { field: WEB_FIELDS.high },
    },
  };
}

/**
 * The layers of a spec the writer returned: its mark, encoding and transform (a layered spec gives
 * its first layer), with the theme stripped. A spec that carries data is refused; so are a mark,
 * channels or transforms that are not allowed.
 */
export function layersFromSpec(
  text: string,
  chart: Chart,
):
  | {
      ok: true;
      mark: string;
      encoding: Record<string, unknown>;
      transform: unknown[];
      stripped: string[];
    }
  | { ok: false; why: PatchDropReason; detail: string } {
  const spec = readValue(text);
  if (spec === null || typeof spec !== "object" || Array.isArray(spec))
    return { ok: false, why: "invalid_value", detail: "The spec is not a JSON object." };
  const s = spec as Record<string, unknown>;
  if (carriesData(s.data) || carriesData(s.datasets) || carriesData(s.transform))
    return { ok: false, why: "inline_data", detail: "The spec carries data." };
  const view = Array.isArray(s.layer) ? ((s.layer[0] as Record<string, unknown>) ?? {}) : s;
  if (carriesData(view.data) || carriesData(view.encoding))
    return { ok: false, why: "inline_data", detail: "The spec carries data." };
  const markRaw = view.mark;
  const mark =
    typeof markRaw === "object" && markRaw !== null
      ? (markRaw as { type?: unknown }).type
      : markRaw;
  if (typeof mark !== "string" || !(MARKS as readonly string[]).includes(mark))
    return { ok: false, why: "invalid_value", detail: `mark is one of ${MARKS.join(", ")}.` };
  const encoding = view.encoding;
  if (encoding === null || typeof encoding !== "object" || Array.isArray(encoding))
    return { ok: false, why: "invalid_value", detail: "The spec has no encoding." };
  const unknown = Object.keys(encoding).filter((k) => !CHANNELS.has(k));
  const transform = Array.isArray(s.transform) ? s.transform : [];
  const enc = stripTheme(
    Object.fromEntries(Object.entries(encoding).filter(([k]) => CHANNELS.has(k))),
    ["encoding"],
  );
  const tr = stripTheme(transform, ["transform"]);
  const problem = transformProblem(tr.value as unknown[], chart);
  if (problem) return { ok: false, why: "transform_not_allowed", detail: problem };
  return {
    ok: true,
    mark,
    encoding: enc.value as Record<string, unknown>,
    transform: tr.value as unknown[],
    stripped: [...unknown.map((k) => `encoding.${k}`), ...enc.stripped, ...tr.stripped],
  };
}

/**
 * The layers code writes when the writer's spec does not render (or there is none): the mark most
 * briefs chose, the dimension on x and the first measure (or the first output of an aggregate) on y.
 */
export function defaultLayers(
  chart: Chart,
  mark: string,
): { mark: string; encoding: Record<string, unknown> } {
  if (chart.data.origin === "web") {
    const temporal = temporalKeys(chart.data.rows);
    return {
      mark,
      encoding: {
        x: {
          field: WEB_FIELDS.key,
          type: temporal ? "temporal" : "nominal",
          title: chart.brief.dimensions[0] ?? null,
          ...(temporal ? {} : { sort: null }),
        },
        y: {
          field: WEB_FIELDS.value,
          type: "quantitative",
          title: chart.brief.measures[0] ?? null,
        },
        tooltip: [
          { field: WEB_FIELDS.key, type: temporal ? "temporal" : "nominal" },
          { field: WEB_FIELDS.value, type: "quantitative" },
        ],
      },
    };
  }
  const dim = chart.brief.dimensions[0] ?? chart.data.columns[0]?.name ?? "";
  const aggregate = chart.transform.find(
    (t): t is { aggregate: { as?: string }[] } =>
      typeof t === "object" &&
      t !== null &&
      Array.isArray((t as { aggregate?: unknown }).aggregate),
  );
  const measure =
    aggregate?.aggregate.find((a) => typeof a.as === "string")?.as ??
    chart.brief.measures[0] ??
    chart.data.columns.find((c) => c.type === "number")?.name ??
    "";
  const dimType = chart.data.columns.find((c) => c.name === dim)?.type;
  // a second field the aggregate groups by is told apart by color (side by side for bars)
  const group = (aggregate as { groupby?: unknown } | undefined)?.groupby;
  const series = Array.isArray(group)
    ? group.find((g) => typeof g === "string" && g !== dim)
    : undefined;
  return {
    mark,
    encoding: {
      x: {
        field: dim,
        type: dimType === "date" ? "temporal" : dimType === "number" ? "quantitative" : "nominal",
      },
      y: { field: measure, type: "quantitative" },
      ...(typeof series === "string"
        ? {
            color: { field: series, type: "nominal" },
            ...(mark === "bar" ? { xOffset: { field: series, type: "nominal" } } : {}),
          }
        : {}),
    },
  };
}

/** The models in fixed order: the order in which equal choices are broken. */
export function firstByModelOrder<T>(
  items: readonly { model: ModelId; value: T }[],
): T | undefined {
  return [...items].sort((a, b) => MODELS.indexOf(a.model) - MODELS.indexOf(b.model))[0]?.value;
}
