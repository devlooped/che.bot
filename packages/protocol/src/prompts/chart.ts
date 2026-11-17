import type { ColumnSummary } from "../csv.ts";
import type { Chart, Source } from "../model.ts";
import { LANGUAGE_RULE, type Prompt, renderSources, STRUCTURED_RULE } from "./common.ts";
import type { ThreadView } from "./round.ts";

// The prompts of a chart run. Data first, design second: the drafts are briefs (and, for web data,
// the rows with their citations); code merges them; one model writes the spec; the rounds patch
// the layers and check the sources of the rows in dispute. The prompts explain the rules; the
// reducer enforces them.

const NO_VALUES_RULE =
  "Never type a number of the data yourself: the numbers come from the uploaded rows, computed by code through the transform.";

export function briefWebPrompt(input: {
  question: string;
  maxResults: number;
  maxRows: number;
}): Prompt {
  return {
    system: [
      "You are one of several experts who each prepare, alone, the data for a chart that answers the user's question. You do not see the others' work.",
      `Search the web for the figures (at most ${input.maxResults} results). Every row needs a citation: the exact URL of a search result of yours that states the value, and the exact words of that page that state it. A row whose URL your search did not return, or whose words do not state its number, is discarded; never type a URL or a figure from memory.`,
      "Return:",
      "- question: the question the chart answers, in one sentence;",
      "- dimension: what each row is (the label of its axis, such as Mes or Ciudad);",
      "- measure: the ONE value compared, with its unit (such as Inflación mensual (%), Población (habitantes));",
      "- mark: bar, line, point or area;",
      `- rows: at most ${input.maxRows}, one per value: key (a date as YYYY, YYYY-MM or YYYY-MM-DD; a place or a name as the question writes it), value (digits with a dot for decimals, no thousands separator, no unit), source (URL) and quote.`,
      "Prefer official and primary sources (statistics offices, central banks, censuses), and the most recent figure, of the same year or edition for every row when you can. If the data for a row does not exist yet (a future month), leave the row out; do not estimate.",
      "Every row is the same kind of thing (all municipalities, or all metropolitan areas; all monthly rates): say which in dimension and measure, and leave out rows of another kind.",
      LANGUAGE_RULE,
      STRUCTURED_RULE,
    ].join("\n"),
    prompt: `Question:\n${input.question}`,
  };
}

export function renderColumns(columns: readonly ColumnSummary[], rows: number): string {
  const lines = columns.map((c) => {
    const stats =
      c.type === "number"
        ? `min ${c.min}, max ${c.max}, mean ${c.mean}, sum ${c.sum}`
        : c.type === "date"
          ? `from ${c.min} to ${c.max}`
          : `${c.distinct} distinct, such as ${c.examples.map((e) => JSON.stringify(e)).join(", ")}`;
    return `- ${c.name} (${c.type}): ${c.filled} values${c.empty ? `, ${c.empty} empty` : ""}; ${stats}`;
  });
  return `${rows} rows. Columns:\n${lines.join("\n")}`;
}

export function briefUserPrompt(input: {
  question: string;
  columns: readonly ColumnSummary[];
  rows: number;
}): Prompt {
  return {
    system: [
      "You are one of several experts who each plan, alone, a chart of the user's uploaded data that answers the user's question. You do not see the others' plans.",
      `You see the columns, their types and summary statistics, not the rows. ${NO_VALUES_RULE}`,
      "Return:",
      "- question: the question the chart answers, in one sentence;",
      "- dimension: the column the chart is drawn along;",
      "- measures: the fields whose values the chart shows: columns, or fields your transform makes (such as the `as` of an aggregate);",
      "- mark: bar, line, point or area;",
      '- transform: a JSON array of Vega-Lite transforms over the columns (aggregate, bin, timeUnit, filter, calculate, window, joinaggregate, fold, pivot), or [] if the rows are drawn as they are. A calculate must read datum and make a new field. Example: [{"aggregate":[{"op":"sum","field":"ventas","as":"total"}],"groupby":["region"]}]',
      LANGUAGE_RULE,
      STRUCTURED_RULE,
    ].join("\n"),
    prompt: `Question:\n${input.question}\n\nThe uploaded data:\n${renderColumns(input.columns, input.rows)}`,
  };
}

export interface MergeBrief {
  label: string;
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
      "You align the data that several experts prepared, alone, for one chart. You never see or change their numbers: only labels.",
      "Return:",
      "- question, dimension, measure: the ones most drafts share, in the language of the question;",
      "- drafts: for each draft letter, same when its measure is the agreed one (the same quantity and unit; a monthly rate and a yearly rate are different) and its rows are of the agreed kind (municipalities and metropolitan areas are different), different otherwise;",
      "- keys: for every row id, the one label that all drafts use for that row (the same month, place or name written the same way: a date as YYYY, YYYY-MM or YYYY-MM-DD). Rows about the same thing get the same label; keep a label as it is when it is already right.",
      STRUCTURED_RULE,
    ].join("\n"),
    prompt: `Question:\n${input.question}\n\n${input.briefs
      .map((b) =>
        [
          `## Draft ${b.label}`,
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

/** The data of a chart as the models see it: rows with their status and sources, or the columns. */
export function renderChartData(chart: Chart, columns: readonly ColumnSummary[] | null): string {
  if (chart.data.origin === "user")
    return `Uploaded data (fields are the column names). ${renderColumns(columns ?? [], chart.data.rows.length)}`;
  const lines = chart.data.rows.map((r) => {
    const alts = r.alternatives.length
      ? `; other values: ${r.alternatives.map((a) => `${a.values.value} (${a.source})`).join(", ")}`
      : "";
    return `- ${r.key}: ${r.values.value} (${r.status}, ${r.source})${alts}`;
  });
  return `Web data (fields: key, value; rows: ${chart.data.rows.length}):\n${lines.join("\n")}`;
}

export function renderLayers(chart: Chart): string {
  return [
    `title: ${JSON.stringify(chart.title)}`,
    `caption: ${JSON.stringify(chart.caption)}`,
    `encoding: ${JSON.stringify({ mark: chart.mark, encoding: chart.encoding })}`,
    `transform: ${JSON.stringify(chart.transform)}`,
  ].join("\n");
}

export function chartSpecPrompt(input: {
  question: string;
  chart: Chart;
  columns: readonly ColumnSummary[] | null;
}): Prompt {
  const { chart } = input;
  const fields =
    chart.data.origin === "web"
      ? 'The data has the fields "key" (the dimension, ' +
        (chart.brief.dimensions[0] ?? "") +
        ') and "value" (the measure, ' +
        (chart.brief.measures[0] ?? "") +
        "). Use them by these names, and give the axes readable titles."
      : `The data has the uploaded columns. The agreed transform is ${JSON.stringify(chart.transform)}: build on it, and encode the fields it produces.`;
  return {
    system: [
      "Several experts agreed on the data of a chart that answers the user's question. You write its Vega-Lite spec (v6).",
      `spec: a JSON object with mark, encoding and, if needed, transform. No data (it is added by code), no config, no colors, no fonts, no width or height: the app's theme is fixed and anything of the theme is removed. ${fields}`,
      chart.data.origin === "user"
        ? NO_VALUES_RULE
        : "Never type a value of the data into the spec.",
      "title: a short title. caption: two or three sentences that say what the chart shows, from which sources, and what stays uncertain or disputed.",
      "The spec is compiled and rendered; one that does not render is replaced by a plain chart.",
      LANGUAGE_RULE,
      STRUCTURED_RULE,
    ].join("\n"),
    prompt: `Question:\n${input.question}\n\nThe agreed brief: ${JSON.stringify(chart.brief)}; suggested mark: ${chart.mark}.\n\n${renderChartData(chart, input.columns)}`,
  };
}

/** A row in dispute as one checker sees it: the values, each with its source and quote. */
export interface DisputeView {
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

export function chartRoundPrompt(input: {
  question: string;
  round: 1 | 2 | 3;
  cap: number;
  chart: Chart;
  columns: readonly ColumnSummary[] | null;
  sources: readonly Source[];
  threads: readonly ThreadView[];
  locked: readonly string[];
  disputes: readonly DisputeView[];
}): Prompt {
  const { round, chart } = input;
  const proposes = round < 3;
  const votes = round > 1;
  const user = chart.data.origin === "user";
  const rules = [
    `You are one of four reviewers improving a shared chart that answers a user's question, in round ${round} of 3. You never edit the chart: you ${[
      proposes ? "suggest patches" : null,
      votes ? "vote on open threads" : null,
      input.disputes.length ? "check the sources of disputed rows" : null,
    ]
      .filter(Boolean)
      .join(", ")}. Code applies the decisions once at the end of the round.`,
  ];
  if (proposes) {
    rules.push(
      "Patches:",
      `- At most ${input.cap}, most important first: any beyond ${input.cap} are discarded unread.`,
      "- Substance only: a chart that is wrong, missing something or misleading (a wrong aggregate or field, a misleading axis or scale, a caption that overstates). Colors, fonts and sizes are fixed by the app and removed; a patch of kind style is discarded.",
      '- layer and path: title or caption with path "" (value: the new text); transform with path "" (the whole JSON list) or an index (one transform); encoding with path "mark" (bar, line, point, area...), "encoding" or "encoding.<channel>[.<property>]" (value: JSON; null removes it).',
      "- Every patch is rendered first, on the current chart and with your other patches of this round: one that does not render is discarded. An encoding of a field that a new transform makes needs that transform patch too.",
      user
        ? `- The data layer of an upload is not yours: a data patch is discarded. ${NO_VALUES_RULE}`
        : "- data: a row whose value is wrong, or a missing row: path is the row key, value the number, sources one source id from the list, quote the words of that source that state the value. It does not replace the value: it opens a dispute that the others settle by checking the sources, never by voting on the number.",
      "- reason: one sentence. A longer reason discards the patch.",
    );
    if (input.locked.length > 0)
      rules.push(
        `- ${input.locked.join(", ")} have an open thread: a patch there joins the thread as one more alternative.`,
      );
  }
  if (votes) {
    rules.push(
      "Votes:",
      '- For each open thread, hold one position: one of its suggestion ids, or "keep". The other reviewers are Reviewer A, B and C, shuffled per thread: judge the arguments, not the count.',
      "- If you change your position, give a one-sentence reason; a change without a reason is ignored.",
      "- A patch is accepted when at least 2 reviewers other than its author hold it and they are a majority of the others who took a position.",
    );
  }
  if (input.disputes.length > 0) {
    rules.push(
      "Checks (rows of the data whose value is disputed or has a single source):",
      "- For each value that is not yours, say whether its source holds up: holds when the quote, from that page, states that number for that row (the same quantity, unit, period and place); fails when it states something else or nothing; unclear when you cannot tell.",
      "- You judge the source, not which number you prefer. A value holds when its quote states it and most reviewers who check it say holds; if no single value holds, the chart shows all of them as a range.",
    );
  }
  rules.push(LANGUAGE_RULE, STRUCTURED_RULE);

  const threads = input.threads.length
    ? `\n\nOpen threads:\n\n${input.threads
        .map((t) =>
          [
            `### ${t.id} on ${t.block}`,
            ...t.alternatives.map(
              (a) => `- ${a.id} by ${a.by}: ${a.op} ${a.text}\n  reason: ${a.reason}`,
            ),
            "Positions:",
            ...t.positions.map((p) => `- ${p.by}: ${p.choice}${p.reason ? ` (${p.reason})` : ""}`),
            `Your position: ${t.yours ?? "none yet"}`,
          ].join("\n"),
        )
        .join("\n\n")}`
    : "";
  const disputes = input.disputes.length
    ? `\n\nRows to check:\n\n${input.disputes
        .map((d) =>
          [
            `### row ${d.row}`,
            ...d.values.map(
              (v) =>
                `- ${v.id}: ${v.value}${v.yours ? " (yours: do not check it)" : ""}, ${v.source} ${v.title} <${v.url}>\n  quote: "${v.quote}"`,
            ),
          ].join("\n"),
        )
        .join("\n\n")}`
    : "";
  return {
    system: rules.join("\n"),
    prompt: `Question:\n${input.question}\n\nThe chart ${chart.id}:\nbrief: ${JSON.stringify(chart.brief)}\n${renderLayers(chart)}\n\n${renderChartData(chart, input.columns)}\n\nSources:\n${renderSources(input.sources)}${threads}${disputes}`,
  };
}
