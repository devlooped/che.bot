import { randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { chartRenderer } from "@chebot/charts";
import { type CallLedger, type ChartRenderer, type Driven, drive, startRun } from "@chebot/driver";
import {
  type Answer,
  type ChartAnswer,
  chartIds,
  type LoggedEvent,
  MODEL_NAMES,
  type Mode,
  type ModelId,
  type OutputOf,
  type RunState,
  selectAnswer,
  selectChart,
} from "@chebot/protocol";
import {
  type CatalogModel,
  type Classification,
  type ClassifyRequest,
  classify,
  createGatewayProvider,
  gatewayCatalog,
  type ModelProvider,
  type ModelSnapshot,
  ProviderError,
  resolveModels,
} from "@chebot/providers";
import { fileLedger } from "./file-ledger.ts";

export const ASK_USAGE = `Usage: pnpm cli ask "<question>" [--mode quick|thorough] [--max-usd <n>] [--out <dir>]

  Every question runs the full process; its class (simple or complex) only sets the price. The
  answer is text, with up to 3 charts when two drafts or more chart the same figures (found on the
  web, each value with its citation).
  --mode     thorough (the default: drafts, merge and the rounds) or quick (stops after the
             merge; it exists for the evaluation)
  --max-usd  the budget of the question in USD (default: the config's)
  --out      where the logs of the run go (default .runs)`;

export interface AskArgs {
  question: string;
  mode: Mode;
  maxUsd: number | null;
  out: string;
}

export function parseAskArgs(argv: string[]): AskArgs | { error: string } {
  let parsed: ReturnType<typeof parse>;
  try {
    parsed = parse(argv);
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
  const { values, positionals } = parsed;
  const question = positionals.join(" ").trim();
  if (question === "") return { error: "A question is required." };
  const mode = values.mode ?? "thorough";
  if (mode !== "quick" && mode !== "thorough")
    return { error: `--mode is quick or thorough, not ${mode}.` };
  let maxUsd: number | null = null;
  if (values["max-usd"] !== undefined) {
    maxUsd = Number(values["max-usd"]);
    if (!Number.isFinite(maxUsd) || maxUsd <= 0)
      return { error: `--max-usd is a positive number of USD, not ${values["max-usd"]}.` };
  }
  return { question, mode, maxUsd, out: values.out ?? ".runs" };
}

function parse(argv: string[]) {
  return parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      mode: { type: "string" },
      "max-usd": { type: "string" },
      out: { type: "string" },
    },
  });
}

/** What `ask` needs from the outside; the defaults are the Gateway and the system clock. */
export interface AskDeps {
  provider: ModelProvider;
  catalog: () => Promise<CatalogModel[]>;
  classify: (req: ClassifyRequest) => Promise<Classification>;
  /** Defaults to ledger.jsonl in the directory of the run: every call result, as it lands. */
  ledger?: CallLedger;
  now: () => number;
  runId: () => string;
  /** Progress lines, for stderr. */
  progress: (line: string) => void;
  /** The render gate of the charts; defaults to Vega in interpreter mode (@chebot/charts). */
  renderer?: ChartRenderer;
}

export function gatewayDeps(): AskDeps {
  return {
    provider: createGatewayProvider(),
    catalog: gatewayCatalog,
    classify: (req) => classify(req),
    now: Date.now,
    runId: randomUUID,
    progress: (line) => process.stderr.write(`${line}\n`),
  };
}

export interface AskResult {
  code: number;
  /** The result, for stdout. */
  message: string;
  run?: Driven;
  classification?: Classification | null;
  mode?: Mode;
  dir?: string;
}

const CLASSIFY_TIMEOUT_MS = 20_000;

export async function ask(args: AskArgs, deps: AskDeps): Promise<AskResult> {
  const started = deps.now();
  const elapsed = () => `${((deps.now() - started) / 1000).toFixed(1).padStart(5)}s`;
  const say = (line: string) => deps.progress(`[${elapsed()}] ${line}`);

  say("reading the model catalog");
  const models: ModelSnapshot = resolveModels([], await deps.catalog());

  say(`classifying with ${models.classifier.id}`);
  let classification: Classification | null = null;
  try {
    classification = await deps.classify({
      question: args.question,
      model: models.classifier,
      signal: AbortSignal.timeout(CLASSIFY_TIMEOUT_MS),
    });
  } catch (error) {
    const kind = ProviderError.isInstance(error) ? error.kind : "error";
    say(`the classifier failed (${kind}); the question counts as complex`);
  }
  const mode = args.mode;

  const id = deps.runId();
  const dir = join(args.out, `${stamp(started)}-${id.slice(0, 8)}`);
  mkdirSync(dir, { recursive: true });
  const eventsFile = join(dir, "events.jsonl");
  writeFileSync(eventsFile, "");

  const run = startRun(
    {
      id,
      question: args.question,
      mode,
      models,
      ...(args.maxUsd !== null ? { config: { budgetUsd: args.maxUsd } } : {}),
    },
    deps.now(),
  );
  for (const e of run.log) appendFileSync(eventsFile, `${JSON.stringify(e)}\n`);
  say(`run ${id}, ${mode} mode, budget US$${run.state.config.budgetUsd}`);
  /** The SVG of every render result, by "<call>#<result>". */
  const svgs = new Map<string, string>();

  const onEvent = (e: LoggedEvent) => {
    appendFileSync(eventsFile, `${JSON.stringify(e)}\n`);
    if (e.type === "stage.changed") say(`stage ${e.stage}${e.cut ? ` (cut: ${e.cut})` : ""}`);
    if (e.type === "moment") say(`  » ${e.text}`);
  };
  const driven = await drive(run, {
    provider: deps.provider,
    now: deps.now,
    onEvent,
    ledger: deps.ledger ?? fileLedger(join(dir, "ledger.jsonl")),
    renderer: deps.renderer ?? chartRenderer,
    onCall: (call, phase, entry) => {
      if (phase === "start" || !entry) return;
      const r = entry.result;
      if (call.kind === "render" && r.status === "ok") {
        for (const x of (r.output as OutputOf<"render">).results) {
          if (x.status === "ok") svgs.set(`${call.key}#${x.id}`, x.svg);
          else say(`  ${call.key} ${x.id} does not render: ${x.error}`);
        }
      }
      const status = r.status === "ok" ? "ok" : `abstained (${r.reason})`;
      say(
        `  ${call.key.padEnd(16)} ${entry.model.id.padEnd(28)} ${status} ${(r.latencyMs / 1000).toFixed(1)}s $${r.costUsd.toFixed(4)}${entry.cached ? " (ledger)" : ""}`,
      );
    },
  });

  writeJsonLines(join(dir, "calls.jsonl"), driven.calls);
  const charts = writeCharts(driven.state, dir, svgs);
  const wallMs = deps.now() - started;
  writeFileSync(
    join(dir, "run.json"),
    `${JSON.stringify({ classification, mode, wallMs, state: driven.state }, null, 2)}\n`,
  );

  const message = report({
    state: driven.state,
    classification,
    mode,
    wallMs,
    dir,
    charts,
  });
  return {
    code: driven.state.status === "completed" ? 0 : 1,
    message,
    run: driven,
    classification,
    mode,
    dir,
  };
}

/** A chart of the answer (`block`, such as c1), from the run state. */
export function chartAnswer(state: RunState, block: string, version?: number): ChartAnswer | null {
  return selectChart(
    { ...state, disputes: state.charts.disputes, renders: state.charts.renders },
    block,
    version,
  );
}

/**
 * Writes each chart of the answer next to the logs: chart-<id>.vl.json (the Vega-Lite spec of the
 * last version, data and theme included), rows-<id>.json (the rows with their sources and disputes)
 * and chart-<id>-v<N>.svg (the render of every version).
 */
function writeCharts(
  state: RunState,
  dir: string,
  svgs: ReadonlyMap<string, string>,
): ChartAnswer[] {
  const answers: ChartAnswer[] = [];
  for (const id of chartIds(state)) {
    const answer = chartAnswer(state, id);
    if (!answer) continue;
    answers.push(answer);
    writeFileSync(join(dir, `chart-${id}.vl.json`), `${JSON.stringify(answer.spec, null, 2)}\n`);
    writeFileSync(
      join(dir, `rows-${id}.json`),
      `${JSON.stringify({ brief: answer.brief, rows: answer.rows }, null, 2)}\n`,
    );
    for (const r of state.charts.renders.filter((x) => x.block === id)) {
      const svg = svgs.get(`${r.call}#${r.result}`);
      if (r.ok && svg) writeFileSync(join(dir, `chart-${id}-v${r.version}.svg`), svg);
    }
  }
  return answers;
}

function writeJsonLines(file: string, rows: readonly unknown[]) {
  writeFileSync(file, rows.map((r) => `${JSON.stringify(r)}\n`).join(""));
}

function stamp(ms: number): string {
  return new Date(ms).toISOString().slice(0, 19).replace(/[:]/g, "-");
}

const usd = (n: number) => `US$${n.toFixed(4)}`;
const names = (models: readonly ModelId[]) => models.map((m) => MODEL_NAMES[m]).join(", ");

/** The printed result of a run. */
export function report(input: {
  state: RunState;
  classification: Classification | null;
  mode: Mode;
  wallMs: number;
  dir: string;
  charts?: readonly ChartAnswer[];
}): string {
  const { state, classification } = input;
  const out: string[] = [];
  out.push("Models");
  for (const [role, model] of Object.entries(state.models)) {
    out.push(`  ${role.padEnd(13)} ${model.id}${model.effort ? ` (${model.effort})` : ""}`);
  }
  out.push("");
  const cls = classification
    ? `${classification.class} (${classification.choice}, p=${classification.probability?.toFixed(2) ?? "?"})`
    : "unknown (the classifier failed: counted as complex)";
  out.push(`Class: ${cls} (sets the price); mode ${input.mode}`);
  out.push(`Status: ${state.status}${state.failure ? ` (${state.failure})` : ""}`);
  out.push("");

  const answer: Answer | null = selectAnswer(state);
  const charts = new Set(chartIds(state));
  if (answer) {
    out.push(`Answer (version ${answer.version})`);
    for (const p of answer.paragraphs) {
      const meta =
        p.tally.for === p.tally.of
          ? p.status
          : `${p.status}, ${p.tally.for} de ${p.tally.of}: ${names(p.support)}`;
      const sources = p.sources.length ? ` [${p.sources.join(", ")}]` : "";
      out.push(`  [${p.id}] ${meta}${sources}`);
      out.push(indent(p.text, "    "));
    }
    out.push("");
    const dissent = answer.dissent.filter((d) => !charts.has(d.block));
    if (dissent.length > 0) {
      out.push("Dissent notes");
      for (const d of dissent) {
        const who = [d.author, ...d.coAuthors];
        const text = d.op === "delete" ? "delete the paragraph" : `${d.op}: "${d.text}"`;
        out.push(
          `  ${d.thread} on ${d.block} (${d.state}), by ${names(who)}, held by ${names(d.holders) || "nobody"}`,
        );
        out.push(indent(`${text}\nreason: ${d.reason}`, "    "));
      }
      out.push("");
    }
    if (answer.sources.length > 0) {
      out.push("Sources");
      for (const s of answer.sources) out.push(`  ${s.id} ${s.title} <${s.url}>`);
      out.push("");
    }
  }
  for (const chart of input.charts ?? []) out.push(...chartReport(state, chart));
  const drawn = new Set(Object.values(state.charts.plans).flatMap((p) => p.briefs));
  const declined = state.charts.briefs
    .filter((b) => !drawn.has(b.id))
    .map((b) => `${MODEL_NAMES[b.model]} ${b.measure}`);
  if (declined.length > 0) out.push(`Charts proposed and not drawn: ${declined.join("; ")}`, "");

  if (state.moments.length > 0) {
    out.push("Moments");
    for (const m of state.moments) out.push(`  [${m.batch}] ${m.text} (${m.origin})`);
    out.push("");
  }

  const abstained = state.abstentions;
  out.push(
    `Abstained: ${
      abstained.length === 0
        ? "none"
        : abstained
            .map(
              (a) =>
                `${a.seat === "utility" ? "utility" : MODEL_NAMES[a.seat]} ${a.call} (${a.reason})`,
            )
            .join("; ")
    }`,
  );
  const flags: string[] = [];
  if (state.flags.budgetReached) flags.push("budget reached");
  if (state.flags.deadlineReached) flags.push("deadline reached");
  if (state.flags.fewDrafts) flags.push(`fewer than ${state.config.quorum} drafts`);
  if (state.flags.quorumLost) flags.push("a round lost its quorum");
  if (state.flags.mergeFallback) flags.push(`merge fallback: ${state.flags.mergeFallback}`);
  out.push(`Flags: ${flags.length ? flags.join(", ") : "none"}`);
  const panelCalls = Object.values(state.calls).length;
  const cost = classification ? state.spentUsd + classification.costUsd : state.spentUsd;
  out.push(
    `Cost: ${usd(cost)} (run ${usd(state.spentUsd)} of ${usd(state.config.budgetUsd)}, classifier ${usd(classification?.costUsd ?? 0)}); ${panelCalls} calls`,
  );
  out.push(`Time: ${(input.wallMs / 1000).toFixed(1)} s`);
  out.push(`Logs: ${input.dir}`);
  return out.join("\n");
}

/** The printed chart: the brief, the rows with their sources, the disagreements. */
function chartReport(state: RunState, chart: ChartAnswer): string[] {
  const out: string[] = [];
  const id = chart.block;
  const plan = state.charts.plans[id];
  out.push(`Chart ${id} (version ${chart.version})`);
  out.push(`  title: ${chart.title}`);
  out.push(`  question: ${chart.brief.question}`);
  out.push(
    `  dimension: ${chart.brief.dimensions.join(", ")}; measures: ${chart.brief.measures.join(", ")}`,
  );
  const written = plan?.writer ? `${MODEL_NAMES[plan.writer]} wrote the spec` : "no writer";
  out.push(
    `  ${written}; ${chart.render?.ok ? "it renders" : `it does not render: ${chart.render?.error ?? "no render"}`}`,
  );
  out.push(indent(`caption: ${chart.caption}`, "  "));
  out.push("");
  out.push("Rows");
  for (const r of chart.rows) {
    const v = r.values.value;
    const range =
      r.status === "unsettled"
        ? ` (range ${[v, ...r.alternatives.map((a) => a.value)].join(" to ")})`
        : "";
    out.push(
      `  ${r.key.padEnd(12)} ${String(v).padStart(12)} ${r.status}${range}, ${names(r.support)}`,
    );
    out.push(
      `    ${r.source?.id ?? "?"} ${r.source?.url ?? "no source"}${r.quote ? ` "${r.quote}"` : ""}`,
    );
    for (const a of r.alternatives)
      out.push(
        `    also ${a.value} by ${names(a.support)}: ${a.source?.url ?? "no source"} "${a.quote}"`,
      );
  }
  out.push("");
  const dropped = state.charts.briefs
    .filter((b) => plan?.briefs.includes(b.id))
    .flatMap((b) => b.dropped.map((d) => `${MODEL_NAMES[b.model]} ${d.key} (${d.why})`));
  if (dropped.length) out.push(`Rows dropped from the drafts: ${dropped.join("; ")}`, "");
  const disputes = Object.values(state.charts.disputes).filter((d) => d.block === id);
  if (disputes.length > 0) {
    out.push("Disputes, settled by source");
    for (const d of disputes) {
      const values = chart.rows
        .find((r) => r.key === d.row)
        ?.dispute?.values.filter((v) => d.values.some((x) => x.id === v.id));
      const detail = (values ?? [])
        .map(
          (v) =>
            `${v.id} ${v.value} holds ${v.holds}/${v.checkers}${v.stated ? "" : ", quote does not state it"}`,
        )
        .join("; ");
      out.push(`  ${d.id} ${d.row}: ${d.state}${d.winner ? ` (${d.winner})` : ""}; ${detail}`);
    }
    out.push("");
  }
  if (chart.dissent.length > 0) {
    out.push("Dissent on the chart");
    for (const d of chart.dissent) {
      const s = state.suggestions[d.suggestion];
      out.push(
        `  ${d.thread} ${s?.target.layer} ${s?.target.path || ""} (${d.state}), by ${names([d.author, ...d.coAuthors])}, held by ${names(d.holders) || "nobody"}: ${d.text}`,
      );
    }
    out.push("");
  }
  const accepted = Object.values(state.threads).filter(
    (t) => t.state === "accepted" && t.block === id,
  );
  if (accepted.length > 0) {
    out.push("Accepted patches");
    for (const t of accepted) {
      const s = t.winner ? state.suggestions[t.winner] : undefined;
      out.push(
        `  ${t.id} ${s?.target.layer} ${s?.target.path || '""'} = ${s?.text} (${t.tally?.for.length} de 4)`,
      );
    }
    out.push("");
  }
  const patches = state.charts.dropped.filter((d) => d.block === id);
  if (patches.length > 0) {
    out.push("Dropped patches");
    for (const d of patches)
      out.push(
        `  ${MODEL_NAMES[d.model]} round ${d.round} ${d.layer} ${d.path || '""'}: ${d.why}${d.detail ? ` (${d.detail})` : ""}`,
      );
    out.push("");
  }
  out.push(
    `Files: chart-${id}.vl.json, rows-${id}.json and chart-${id}-v<N>.svg, with the logs`,
    "",
  );
  return out;
}

function indent(text: string, prefix: string): string {
  return text
    .split("\n")
    .map((l) => `${prefix}${l}`)
    .join("\n");
}
