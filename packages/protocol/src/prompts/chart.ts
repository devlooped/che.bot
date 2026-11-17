import type { Chart, Snapshot } from "../model.ts";
import { LANGUAGE_RULE, type Prompt, renderDocument, STRUCTURED_RULE } from "./common.ts";

// The prompts of the charts. Data first, design second: each draft may propose charts with the
// rows it found, each with its citation; the utility model groups them by measure; one model
// writes each chart's spec; the rounds patch the layers and check the sources of the rows in
// dispute, beside the suggestions on the text. The prompts explain the rules; the reducer enforces
// them.

/** What a draft is told about the charts it may propose. */
export function draftChartRules(input: { maxCharts: number; maxRows: number }): string[] {
  return [
    `- charts: up to ${input.maxCharts}, when the answer compares figures across time, places or categories and a chart makes it clearer; [] for an answer about ideas, causes or a single figure. One chart per measure: two measures (inflation and unemployment) are two charts. For each chart:`,
    "  - question: the question the chart answers, in one sentence;",
    "  - dimension: what each row is (the label of its axis, such as Mes or Ciudad);",
    "  - measure: the ONE value compared, with its unit (such as Inflación mensual (%), Población (habitantes));",
    "  - mark: bar, line, point or area;",
    `  - rows: at most ${input.maxRows}, one per value: key (a date as YYYY, YYYY-MM or YYYY-MM-DD; a place or a name as the question writes it), value (digits with a dot for decimals, no thousands separator, no unit), source (the exact URL of a search result of yours that states the value) and quote (the exact words of that page that state it).`,
    "  A row whose URL your search did not return, or whose words do not state its number, is discarded: never type a URL or a figure from memory. Prefer official and primary sources (statistics offices, central banks, censuses) and the same year or edition for every row; leave out a row whose data does not exist yet, and rows of another kind than the others (all municipalities, or all metropolitan areas).",
    "  A chart is drawn only if other experts chart the same measure; your answer must read well without it.",
  ];
}

/** The data of a chart as the models see it: rows with their status and sources. */
export function renderChartData(chart: Chart): string {
  const lines = chart.data.rows.map((r) => {
    const alts = r.alternatives.length
      ? `; other values: ${r.alternatives.map((a) => `${a.values.value} (${a.source})`).join(", ")}`
      : "";
    return `- ${r.key}: ${r.values.value} (${r.status}, ${r.source})${alts}`;
  });
  return `Data (fields: key, value; rows: ${chart.data.rows.length}):\n${lines.join("\n")}`;
}

export function renderLayers(chart: Chart): string {
  return [
    `title: ${JSON.stringify(chart.title)}`,
    `caption: ${JSON.stringify(chart.caption)}`,
    `encoding: ${JSON.stringify({ mark: chart.mark, encoding: chart.encoding })}`,
    `transform: ${JSON.stringify(chart.transform)}`,
  ].join("\n");
}

/** Every chart of a version, in full: brief, layers and data. */
export function renderCharts(snapshot: Snapshot): string {
  return snapshot.order
    .flatMap((id) => {
      const b = snapshot.blocks[id];
      if (b?.kind !== "chart") return [];
      return [
        `### Chart ${b.id}\nbrief: ${JSON.stringify(b.brief)}\n${renderLayers(b)}\n\n${renderChartData(b)}`,
      ];
    })
    .join("\n\n");
}

export interface MergeBrief {
  id: string;
  question: string;
  dimension: string;
  measure: string;
  rows: { id: string; key: string }[];
}

export function chartMergePrompt(input: {
  question: string;
  briefs: readonly MergeBrief[];
}): Prompt {
  return {
    system: [
      "Several experts each proposed, alone, charts for an answer to one question. You group the proposals that chart the same measure and align their labels. You never see or change their numbers.",
      "Return charts: one entry per measure, the one most proposals share first. For each:",
      "- question, dimension, measure: the ones its proposals share, in the language of the question;",
      "- briefs: the ids of the proposals that chart this measure: the same quantity and unit (a monthly rate and a yearly rate are different) and rows of the same kind (municipalities and metropolitan areas are different). A proposal goes in one entry only;",
      "- keys: for every row id of those proposals, the one label all of them use for that row (the same month, place or name written the same way: a date as YYYY, YYYY-MM or YYYY-MM-DD). Rows about the same thing get the same label; keep a label as it is when it is already right.",
      "A proposal that measures something no other proposal does is an entry of its own.",
      STRUCTURED_RULE,
    ].join("\n"),
    prompt: `Question:\n${input.question}\n\n${input.briefs
      .map((b) =>
        [
          `## Proposal ${b.id}`,
          `question: ${b.question}`,
          `dimension: ${b.dimension}`,
          `measure: ${b.measure}`,
          "rows:",
          ...b.rows.map((r) => `- ${r.id}: ${r.key}`),
        ].join("\n"),
      )
      .join("\n\n")}`,
  };
}

export function chartSpecPrompt(input: {
  question: string;
  chart: Chart;
  document: Snapshot;
}): Prompt {
  const { chart } = input;
  return {
    system: [
      "Several experts agreed on the data of a chart that goes inside their answer to the user's question. You write its Vega-Lite spec (v6) and place it in the answer.",
      `spec: a JSON object with mark, encoding and, if needed, transform. No data (it is added by code), no config, no colors, no fonts, no width or height: the app's theme is fixed and anything of the theme is removed. The data has the fields "key" (the dimension, ${chart.brief.dimensions[0] ?? ""}) and "value" (the measure, ${chart.brief.measures[0] ?? ""}). Use them by these names, and give the axes readable titles. Never type a value of the data into the spec.`,
      "title: a short title. caption: two or three sentences that say what the chart shows, from which sources, and what stays uncertain or disputed.",
      "after: the id of the paragraph of the answer the chart illustrates best; the chart goes right after it.",
      "The spec is compiled and rendered; one that does not render is replaced by a plain chart.",
      LANGUAGE_RULE,
      STRUCTURED_RULE,
    ].join("\n"),
    prompt: `Question:\n${input.question}\n\nThe answer:\n\n${renderDocument(input.document, false)}\n\nThe agreed brief: ${JSON.stringify(chart.brief)}; suggested mark: ${chart.mark}.\n\n${renderChartData(chart)}`,
  };
}

/** A row in dispute as one checker sees it: the values, each with its source and quote. */
export interface DisputeView {
  chart: string;
  row: string;
  values: {
    id: string;
    value: string;
    source: string;
    url: string;
    title: string;
    quote: string;
    yours: boolean;
  }[];
}

/** What a round is told about the charts: patches when it proposes, checks when rows are in dispute. */
export function chartRoundRules(input: {
  proposes: boolean;
  cap: number;
  locked: readonly string[];
  disputes: boolean;
}): string[] {
  const rules: string[] = [];
  if (input.proposes) {
    rules.push(
      "Patches on the charts:",
      `- At most ${input.cap} across all charts, most important first: any beyond ${input.cap} are discarded unread.`,
      "- Substance only: a chart that is wrong, missing something or misleading (a wrong field, a misleading axis or scale, a caption that overstates). Colors, fonts and sizes are fixed by the app and removed; a patch of kind style is discarded.",
      '- chart: the id of the chart. layer and path: title or caption with path "" (value: the new text); transform with path "" (the whole JSON list) or an index (one transform); encoding with path "mark" (bar, line, point, area...), "encoding" or "encoding.<channel>[.<property>]" (value: JSON; null removes it).',
      "- Every patch is rendered first, on the current chart and with your other patches of that chart in this round: one that does not render is discarded. An encoding of a field that a new transform makes needs that transform patch too.",
      "- data: a row whose value is wrong, or a missing row: path is the row key, value the number, sources one source id from the list, quote the words of that source that state the value. It does not replace the value: it opens a dispute that the others settle by checking the sources, never by voting on the number.",
      "- reason: one sentence. A longer reason discards the patch.",
      "- A chart cannot be added, removed or moved.",
    );
    if (input.locked.length > 0)
      rules.push(
        `- ${input.locked.join(", ")} have an open thread or a row being checked: a patch on a layer there joins its thread as one more alternative; a data patch on a row being checked is discarded.`,
      );
  }
  if (input.disputes) {
    rules.push(
      "Checks (rows of a chart whose value is disputed or has a single source):",
      "- For each value that is not yours, say whether its source holds up: holds when the quote, from that page, states that number for that row (the same quantity, unit, period and place); fails when it states something else or nothing; unclear when you cannot tell. Name the chart and the row.",
      "- You judge the source, not which number you prefer. A value holds when its quote states it and most reviewers who check it say holds; if no single value holds, the chart shows all of them as a range.",
    );
  }
  return rules;
}

export function renderDisputes(disputes: readonly DisputeView[]): string {
  return disputes
    .map((d) =>
      [
        `### chart ${d.chart}, row ${d.row}`,
        ...d.values.map(
          (v) =>
            `- ${v.id}: ${v.value}${v.yours ? " (yours: do not check it)" : ""}, ${v.source} ${v.title} <${v.url}>\n  quote: "${v.quote}"`,
        ),
      ].join("\n"),
    )
    .join("\n\n");
}
