import { CHART_THEME, type Chart, clone, WEB_FIELDS } from "@chebot/protocol";

// The Vega-Lite spec the browser draws (step 41), composed from the chart block of a version: its
// layers and the app's fixed theme, as `chartSpec` composes it for the render gate, with what the
// page adds. The title is not in the chart (the page shows it as a heading); the data is a named
// set the page fills and changes, so that a new version moves the marks instead of drawing the
// chart again; a web chart draws the range of an unsettled row with both its ends, and the number
// of the note of a corrected, disputed or unconfirmed row next to its point. Pure: no vega here.

/** The named data set of every browser spec. */
export const DATA_NAME = "table";

/** A row of the data set: the fields of the chart, and for web charts `note` and `at`. */
export type Datum = Record<string, string | number | null>;

/** Colors of the drawing that are not the models': the ranges and the notes (from CHART_THEME). */
const RANGE_COLOR = CHART_THEME.rule.color;
const NOTE_COLOR = CHART_THEME.title.color;

/** The channel that draws a field in an encoding ("x", "y"), or null. */
function channelOf(encoding: Record<string, unknown>, field: string, among: string[]) {
  return (
    among.find((ch) => (encoding[ch] as { field?: unknown } | undefined)?.field === field) ?? null
  );
}

/** Where a web chart draws its measure and its dimension, or null for an encoding of its own. */
export function webChannels(chart: Pick<Chart, "encoding">) {
  const measure = channelOf(chart.encoding, WEB_FIELDS.value, ["y", "x"]);
  const dimension = channelOf(chart.encoding, WEB_FIELDS.key, ["x", "y"]);
  return measure && dimension && measure !== dimension ? { measure, dimension } : null;
}

/** The fields an encoding draws as dates. */
export function temporalFields(encoding: Record<string, unknown>): Set<string> {
  const out = new Set<string>();
  for (const def of Object.values(encoding)) {
    const d = def as { field?: unknown; type?: unknown } | null;
    if (d && typeof d.field === "string" && d.type === "temporal") out.add(d.field);
  }
  return out;
}

/**
 * A date as the models and uploads write it (2025, 2025-03, 2025-03-31) as the time of that day at
 * midnight on this computer. Vega reads "2025-03" as midnight in UTC, which west of Greenwich is
 * still February on the axis.
 */
export function localTime(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const m = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(value.trim());
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2] ?? 1) - 1, Number(m[3] ?? 1)).getTime();
}

/** The rows of a data set with the dates of `fields` as local times. */
export function withLocalDates(rows: readonly Datum[], fields: ReadonlySet<string>): Datum[] {
  if (fields.size === 0) return rows.map((r) => ({ ...r }));
  return rows.map((r) => {
    const out = { ...r };
    for (const f of fields) {
      const time = localTime(out[f]);
      if (time !== null) out[f] = time;
    }
    return out;
  });
}

/** The page's adjustments to the fixed theme: the size of its text and no automatic labels. */
function pageConfig(): Record<string, unknown> {
  const theme = clone(CHART_THEME) as unknown as Record<string, unknown>;
  return {
    ...theme,
    // The figure has a label of its own and the table is its text: the automatic descriptions of
    // the marks would read the field names ("key", "value") aloud.
    aria: false,
    axis: { ...(theme.axis as object), labelFontSize: 11, titleFontSize: 12, titlePadding: 8 },
    axisX: { labelAngle: 0, labelOverlap: true, labelFlush: true },
    line: { strokeWidth: 2.5, point: { size: 50, filled: true } },
    bar: { cornerRadiusEnd: 2 },
    point: { size: 60, filled: true },
  };
}

/**
 * The spec of a version of a chart for the page. `height` is in pixels; the page sets the width
 * to that of its box. Web charts get the range and note layers when their encoding draws `key` and `value`
 * on two axes; any other encoding is drawn as the models wrote it.
 */
export function browserSpec(chart: Chart, height: number): Record<string, unknown> {
  const main: Record<string, unknown> = { mark: chart.mark, encoding: clone(chart.encoding) };
  // A line draws its points too: the reader can see where each month is and which one is marked.
  if (chart.mark === "line") main.mark = { type: "line", point: true };
  const spec: Record<string, unknown> = {
    $schema: "https://vega.github.io/schema/vega-lite/v6.json",
    width: "container",
    height,
    autosize: { type: "fit-x", contains: "padding" },
    data: { name: DATA_NAME },
    ...(chart.transform.length > 0 ? { transform: clone(chart.transform) } : {}),
    config: pageConfig(),
  };
  const axes = webChannels(chart);
  if (!axes) return Object.assign(spec, main);
  const { measure, dimension } = axes;
  const dim = clone(chart.encoding[dimension]) as Record<string, unknown>;
  const title = (chart.encoding[measure] as { title?: unknown }).title;
  // The extra layers share the axis of the measure: the same title, so that the axis keeps one.
  const at = (field: string) => ({
    field,
    type: "quantitative",
    ...(title !== undefined ? { title } : {}),
  });
  const valid = (field: string) => ({ filter: `isValid(datum.${field})` });
  spec.layer = [
    main,
    {
      transform: [valid(WEB_FIELDS.low)],
      mark: { type: "rule", strokeWidth: 3, color: RANGE_COLOR, strokeCap: "round" },
      encoding: {
        [dimension]: dim,
        [measure]: at(WEB_FIELDS.low),
        [`${measure}2`]: { field: WEB_FIELDS.high },
      },
    },
    ...[WEB_FIELDS.low, WEB_FIELDS.high].map((end) => ({
      transform: [valid(end)],
      // a cap across the range: a point drawn as a short stroke (a tick sits mid-band on dates)
      mark: {
        type: "point",
        shape: measure === "y" ? "M-1,0L1,0" : "M0,-1L0,1",
        filled: false,
        stroke: RANGE_COLOR,
        strokeWidth: 3,
        strokeCap: "round",
        size: 140,
        opacity: 1,
      },
      encoding: { [dimension]: dim, [measure]: at(end) },
    })),
    {
      transform: [{ filter: "isValid(datum.note)" }],
      mark: {
        type: "text",
        color: NOTE_COLOR,
        fontWeight: 700,
        fontSize: 13,
        ...(measure === "y" ? { dy: -14 } : { dx: 14 }),
      },
      encoding: { [dimension]: dim, [measure]: at("at"), text: { field: "note" } },
    },
  ];
  return spec;
}

/** The locale of numbers and dates of the drawing (vega-embed's `formatLocale`, `timeFormatLocale`). */
export interface ChartLocale {
  number: { decimal: string; thousands: string; grouping: number[]; currency: [string, string] };
  time: {
    dateTime: string;
    date: string;
    time: string;
    periods: [string, string];
    days: string[];
    shortDays: string[];
    months: string[];
    shortMonths: string[];
  };
}
