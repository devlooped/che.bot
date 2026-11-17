import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { parseArgs } from "node:util";
import type { LedgerEntry } from "@chebot/driver";
import { MODELS, type ModelId, type ModelSnapshot } from "@chebot/protocol";
import {
  type CatalogModel,
  type Classification,
  type ClassifyRequest,
  type ModelProvider,
  ProviderError,
  resolveModels,
} from "@chebot/providers";
import { Budget, guard, priorSpend, RAW_FILES } from "./budget.ts";
import {
  type Answers,
  type Arm,
  answersOf,
  auditItems,
  auditPrompt,
  comparePrompt,
  gradeItems,
  gradePrompt,
  JUDGE_WORST_USD,
  type JudgeOutcome,
  judgeCall,
  labelled,
  type PairKind,
  type PairSpec,
  sameText,
  showPairs,
} from "./judge.ts";
import { type Question, questionKey, readQuestions } from "./questions.ts";
import {
  bestSingle,
  computeReport,
  emptyVerdicts,
  type PairVerdict,
  type QuestionRecord,
  type ReportData,
  renderReport,
  type StoredClassification,
  type Verdicts,
} from "./report.ts";
import { runQuestion } from "./runs.ts";
import {
  extendSheet,
  GRADES_FILE,
  gradeSlots,
  gradesTemplate,
  KEY_FILE,
  parseGrades,
  renderSheet,
  SHEET_FILE,
  SHEET_SEED,
  type SheetCandidate,
  type SheetKey,
  selectSheet,
  type UserResult,
  userResults,
} from "./sheet.ts";
import { pool } from "./stats.ts";

export const EVAL_USAGE = `Usage: pnpm cli eval --set <file> --max-usd <n> [options]

  --set            the question set, JSON lines (eval/questions.jsonl)
  --max-usd        the cap on the real spend of the whole evaluation, counting what earlier
                   invocations spent; required unless --report
  --run-usd        the budget of one question (default: the protocol's)
  --only q03,q22   only these questions (commas or spaces)
  --limit <n>      only the first n questions (after --only)
  --concurrency    questions at once (default 4)
  --report         rebuild the report and the grading sheet from disk, without any model call
  --out <dir>      where the report and the sheet go (default <set dir>/results/<today>)

  Every model call is kept under <set dir>/results/raw/<set name>/: a rerun pays nothing twice and
  an interrupted evaluation continues where it stopped.`;

export interface EvalArgs {
  set: string;
  maxUsd: number | null;
  runUsd: number | null;
  only: string[] | null;
  limit: number | null;
  concurrency: number;
  report: boolean;
  out: string | null;
}

export function parseEvalArgs(argv: string[]): EvalArgs | { error: string } {
  let values: ReturnType<typeof parse>["values"];
  try {
    const parsed = parse(argv);
    if (parsed.positionals.length > 0)
      return { error: `Unexpected argument: ${parsed.positionals[0]}.` };
    values = parsed.values;
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
  if (!values.set) return { error: "--set is required." };
  const positive = (name: string, raw: string | undefined, integer: boolean) => {
    if (raw === undefined) return null;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0 || (integer && !Number.isInteger(n)))
      return { error: `--${name} is a positive ${integer ? "integer" : "number"}, not ${raw}.` };
    return n;
  };
  const maxUsd = positive("max-usd", values["max-usd"], false);
  const runUsd = positive("run-usd", values["run-usd"], false);
  const limit = positive("limit", values.limit, true);
  const concurrency = positive("concurrency", values.concurrency, true);
  for (const v of [maxUsd, runUsd, limit, concurrency])
    if (v !== null && typeof v === "object") return v;
  if (maxUsd === null && !values.report) return { error: "--max-usd is required (or --report)." };
  return {
    set: values.set,
    maxUsd: maxUsd as number | null,
    runUsd: runUsd as number | null,
    only: values.only
      ? values.only
          // commas or spaces: cmd.exe turns the commas of an unquoted argument into spaces
          .split(/[\s,]+/)
          .map((s) => s.trim())
          .filter(Boolean)
      : null,
    limit: limit as number | null,
    concurrency: (concurrency as number | null) ?? 4,
    report: values.report ?? false,
    out: values.out ?? null,
  };
}

function parse(argv: string[]) {
  return parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      set: { type: "string" },
      "max-usd": { type: "string" },
      "run-usd": { type: "string" },
      only: { type: "string" },
      limit: { type: "string" },
      concurrency: { type: "string" },
      report: { type: "boolean" },
      out: { type: "string" },
    },
  });
}

export interface EvalDeps {
  provider: ModelProvider;
  catalog: () => Promise<CatalogModel[]>;
  classify: (req: ClassifyRequest) => Promise<Classification>;
  now: () => number;
  progress: (line: string) => void;
}

export interface EvalResult {
  code: number;
  message: string;
  report?: ReportData;
  out?: string;
}

const CLASSIFY_TIMEOUT_MS = 20_000;
const CLASSIFY_WORST_USD = 0.005;
const usd = (n: number) => `US$${n.toFixed(4)}`;

export async function evaluate(args: EvalArgs, deps: EvalDeps): Promise<EvalResult> {
  const all = readQuestions(args.set);
  let selected = all;
  if (args.only) {
    const unknown = args.only.filter((id) => !all.some((q) => q.id === id));
    if (unknown.length > 0)
      return { code: 2, message: `Unknown questions: ${unknown.join(", ")}.` };
    selected = all.filter((q) => args.only?.includes(q.id));
  }
  if (args.limit !== null) selected = selected.slice(0, args.limit);

  const base = dirname(args.set);
  const setName = basename(args.set, extname(args.set));
  const raw = join(base, "results", "raw", setName);
  const date = new Date(deps.now()).toISOString().slice(0, 10);
  const out = args.out ?? join(base, "results", date);
  const say = deps.progress;

  const cap = args.maxUsd ?? Number.POSITIVE_INFINITY;
  const budget = new Budget(cap, priorSpend(raw), { stopped: args.report });
  const spentLine = () =>
    `spent ${usd(budget.total())}${Number.isFinite(cap) ? ` of ${usd(cap)}` : ""}`;
  if (!args.report) {
    say(`${selected.length} questions; ${spentLine()} before this invocation`);
    if (budget.total() >= cap) say("the cap is already reached: only what is on disk is reported");
  }

  // The models: resolved once for the set and kept, so every question and judge uses the same.
  const modelsFile = join(raw, "models.json");
  let models: ModelSnapshot | null = existsSync(modelsFile)
    ? (JSON.parse(readFileSync(modelsFile, "utf8")) as ModelSnapshot)
    : null;
  if (!models && !args.report && !budget.stopped) {
    models = resolveModels([], await deps.catalog());
    mkdirSync(raw, { recursive: true });
    writeFileSync(modelsFile, `${JSON.stringify(models, null, 2)}\n`);
  }

  const printCall = (q: Question) => (key: string, entry: LedgerEntry & { cached: boolean }) => {
    if (entry.cached) return;
    const r = entry.result;
    const status = r.status === "ok" ? "ok" : `abstained (${r.reason})`;
    say(
      `[${q.id}] ${key.slice(0, 28).padEnd(28)} ${entry.model.id.padEnd(28)} ${status} ${(r.latencyMs / 1000).toFixed(1)}s ${usd(r.costUsd)}; ${spentLine()}`,
    );
  };

  // Runs, classification, grades and the audit, a few questions at once.
  const records = await pool(selected, args.concurrency, async (q) => {
    const key = questionKey(q);
    const dir = join(raw, key);
    const record: QuestionRecord = {
      q,
      key,
      run: null,
      classification: await classifyQuestion(q, dir, models, budget, deps),
      answers: answersOf(null, null),
      judging: emptyVerdicts(),
    };
    if (!models) return record;
    record.run = await runQuestion(q, key, {
      provider: deps.provider,
      budget,
      dir,
      models,
      runUsd: args.runUsd,
      onCall: printCall(q),
    });
    const run = record.run;
    if (!run.complete || !run.state) {
      if (!args.report)
        say(`[${q.id}] run stopped by the cap; it continues on the next invocation`);
      return record;
    }
    const variant = run.variant;
    record.answers = answersOf(run.state, variant?.complete ? variant.state : null);
    if (!args.report)
      say(
        `[${q.id}] run ${run.state.status} in ${(run.wallMs / 1000).toFixed(1)} s for ${usd(run.state.spentUsd)}${
          variant ? (variant.sameEditor ? "; same editor both ways" : "; editor variant done") : ""
        }`,
      );
    await judgeFirst(record, {
      provider: deps.provider,
      models,
      budget,
      dir,
      onCall: printCall(q),
    });
    return record;
  });

  // The best single model, after the fact; then the pairs against it, T against Q and the editors.
  const best = bestSingle(records);
  if (models) {
    const m = models;
    await pool(records, args.concurrency, (r) =>
      r.run?.complete
        ? compareQuestion(r, best?.model ?? null, {
            provider: deps.provider,
            models: m,
            budget,
            dir: join(raw, r.key),
            onCall: printCall(r.q),
          })
        : Promise.resolve(),
    );
  }

  const incomplete = incompleteReason(records, budget, args.report);
  const sheet = writeSheet(records, best?.model ?? null, out, incomplete === null);
  const report = computeReport(records, {
    set: args.set,
    out,
    date,
    models,
    questionsInSet: all.length,
    capUsd: cap,
    spent: { ...budget.spent },
    spentNow: { ...budget.live },
    incomplete,
    bestSingle: best,
    user: sheet.user,
    sheet: { pairs: sheet.pairs, file: sheet.file },
  });
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "report.md"), renderReport(report));
  writeFileSync(join(out, "report.json"), `${JSON.stringify(report, null, 2)}\n`);

  const lines = [
    `Report: ${join(out, "report.md")}`,
    sheet.file ? `Grading sheet: ${sheet.file} (grades in ${join(out, GRADES_FILE)})` : "",
    `Covered ${report.coverage.covered} of ${report.coverage.selected} questions; ${spentLine()} (this invocation ${usd(budget.live.runs + budget.live.classify + budget.live.judging)}).`,
    incomplete ? `Incomplete: ${incomplete}.` : "",
  ].filter(Boolean);
  return { code: incomplete ? 1 : 0, message: lines.join("\n"), report, out };
}

async function classifyQuestion(
  q: Question,
  dir: string,
  models: ModelSnapshot | null,
  budget: Budget,
  deps: EvalDeps,
): Promise<StoredClassification | null> {
  const file = join(dir, RAW_FILES.classify);
  if (existsSync(file)) {
    try {
      return JSON.parse(readFileSync(file, "utf8")) as StoredClassification;
    } catch {
      // cut short: classified again
    }
  }
  const model = models?.classifier;
  if (!model || !budget.reserve(CLASSIFY_WORST_USD)) return null;
  let stored: StoredClassification;
  const started = Date.now();
  try {
    const c = await deps.classify({
      question: q.question,
      model,
      signal: AbortSignal.timeout(CLASSIFY_TIMEOUT_MS),
    });
    stored = {
      ok: true,
      class: c.class,
      choice: c.choice,
      probability: c.probability,
      costUsd: c.costUsd,
      latencyMs: c.latencyMs,
      reason: null,
    };
  } catch (error) {
    stored = {
      ok: false,
      class: "complex",
      choice: null,
      probability: null,
      costUsd: 0,
      latencyMs: ProviderError.isInstance(error) ? (error.latencyMs ?? 0) : Date.now() - started,
      reason: ProviderError.isInstance(error) ? error.kind : "error",
    };
  }
  budget.settle(CLASSIFY_WORST_USD, stored.costUsd, "classify");
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, `${JSON.stringify(stored)}\n`);
  return stored;
}

type OnCall = (key: string, entry: LedgerEntry & { cached: boolean }) => void;

interface JudgeContext {
  provider: ModelProvider;
  models: ModelSnapshot;
  budget: Budget;
  dir: string;
  onCall: OnCall;
}

function judgeGuard(ctx: JudgeContext) {
  return guard({
    provider: ctx.provider,
    budget: ctx.budget,
    kind: "judging",
    file: join(ctx.dir, RAW_FILES.judge),
    worstUsd: () => JUDGE_WORST_USD,
  });
}

/** Counts a call that was not made or abstained; true when there is an output to read. */
function landed<T>(
  v: Verdicts,
  judge: ModelId,
  out: JudgeOutcome<T>,
): out is Extract<JudgeOutcome<T>, { status: "ok" }> {
  if (out.status === "refused") v.refused++;
  if (out.status === "abstained") v.abstained[judge] = (v.abstained[judge] ?? 0) + 1;
  return out.status === "ok";
}

/** The grades of every arm and the audit of the votes and the dissent: one call per judge each. */
async function judgeFirst(r: QuestionRecord, ctx: JudgeContext) {
  const guarded = judgeGuard(ctx);
  const v = r.judging;
  const audit = auditItems(r.run?.state ?? null);
  v.audit.changes = audit.changes;
  v.audit.notes = audit.notes;
  const gold = r.q.gold !== null;
  await Promise.all(
    MODELS.map(async (judge) => {
      const items = gradeItems(r.answers, `${r.key}|grade|${judge}`);
      if (items.length > 0) {
        const out = await judgeCall({
          guarded,
          models: ctx.models,
          judge,
          kind: gold ? "gradeGold" : "gradeRubric",
          ...gradePrompt(r.q, items),
          onCall: ctx.onCall,
        });
        if (landed(v, judge, out)) {
          const grades: Partial<Record<Arm, { correct: boolean | null; quality: number }>> = {};
          for (const g of out.output.grades) {
            const item = items.find((i) => i.label === labelOf(g.answer));
            if (!item || item.arms.some((a) => grades[a])) continue;
            const correct = "correct" in g ? g.correct === "correct" : null;
            for (const arm of item.arms) grades[arm] = { correct, quality: Number(g.quality) };
          }
          v.grades[judge] = grades;
        }
      }
      if (audit.changes.length + audit.notes.length > 0) {
        const changes = labelled(audit.changes, `${r.key}|audit-changes|${judge}`);
        const notes = labelled(audit.notes, `${r.key}|audit-notes|${judge}`);
        const out = await judgeCall({
          guarded,
          models: ctx.models,
          judge,
          kind: "audit",
          ...auditPrompt(r.q, changes, notes),
          onCall: ctx.onCall,
        });
        if (landed(v, judge, out)) {
          const verdicts = {
            changes: {} as Record<string, string>,
            notes: {} as Record<string, string>,
          };
          for (const c of out.output.changes) {
            const item = changes.find((x) => x.label === labelOf(c.item));
            if (item && !(item.id in verdicts.changes)) verdicts.changes[item.id] = c.verdict;
          }
          for (const n of out.output.suggestions) {
            const item = notes.find((x) => x.label === labelOf(n.item));
            if (item && !(item.id in verdicts.notes)) verdicts.notes[item.id] = n.verdict;
          }
          v.audit.verdicts[judge] = verdicts;
        }
      }
    }),
  );
}

/** "Answer 3", "#3" or "3" is 3. */
function labelOf(text: string): string {
  return /(\d+)/.exec(text)?.[1] ?? text.trim();
}

/**
 * The pairwise preferences of a question: one call per judge with every pair it has, and one call
 * of its own for T against the best single model (an extra measure, so the first calls and their
 * ledger keys stay as they were before it).
 */
async function compareQuestion(r: QuestionRecord, best: ModelId | null, ctx: JudgeContext) {
  const pairs = pairSpecs(r.answers, best);
  const extra = tVsBestPair(r.answers, best);
  const v = r.judging;
  v.pairs = pairs.map((p) => p.kind);
  v.tVsBest.asked = extra !== null;
  const guarded = judgeGuard(ctx);
  const ask = async (
    judge: ModelId,
    kind: "compare" | "compareTs",
    specs: readonly PairSpec[],
    seed: string,
  ) => {
    const shown = showPairs(specs, seed);
    const out = await judgeCall({
      guarded,
      models: ctx.models,
      judge,
      kind,
      ...comparePrompt(r.q, shown),
      onCall: ctx.onCall,
    });
    if (!landed(v, judge, out)) return null;
    const verdicts: Partial<Record<PairKind, PairVerdict>> = {};
    for (const p of out.output.pairs) {
      const pair = shown.find((x) => x.label === labelOf(p.pair));
      if (!pair || verdicts[pair.kind]) continue;
      const preference =
        p.preference === "tie"
          ? "tie"
          : (p.preference === "A") === pair.firstIsA
            ? "first"
            : "second";
      verdicts[pair.kind] = { preference, substance: p.substance };
    }
    return verdicts;
  };
  await Promise.all(
    MODELS.map(async (judge) => {
      if (pairs.length > 0) {
        const verdicts = await ask(judge, "compare", pairs, `${r.key}|compare|${judge}`);
        if (verdicts) v.compare[judge] = verdicts;
      }
      if (extra) {
        const verdicts = await ask(judge, "compareTs", [extra], `${r.key}|compare-ts|${judge}`);
        const ts = verdicts?.ts;
        if (ts) v.tVsBest.verdicts[judge] = ts;
      }
    }),
  );
}

/** T against the best single model, where both have an answer and their texts differ. */
export function tVsBestPair(answers: Answers, best: ModelId | null): PairSpec | null {
  const t = answers.arms.T;
  const single = best ? answers.arms[`S:${best}` as Arm] : null;
  if (t === null || single === null || sameText(t, single)) return null;
  return { kind: "ts", first: t, second: single };
}

export function pairSpecs(answers: Answers, best: ModelId | null): PairSpec[] {
  const a = answers.arms;
  const pairs: PairSpec[] = [];
  const single = best ? a[`S:${best}` as Arm] : null;
  if (a.Q !== null && single !== null && !sameText(a.Q, single))
    pairs.push({ kind: "qs", first: a.Q, second: single });
  if (a.T !== null && a.Q !== null && !sameText(a.T, a.Q))
    pairs.push({ kind: "tq", first: a.T, second: a.Q });
  if (a.T !== null && answers.rotation !== null && !sameText(a.T, answers.rotation))
    pairs.push({ kind: "ed", first: a.T, second: answers.rotation });
  return pairs;
}

function incompleteReason(
  records: readonly QuestionRecord[],
  budget: Budget,
  report: boolean,
): string | null {
  const open = records.filter(
    (r) =>
      !r.classification ||
      !r.run?.complete ||
      (r.run.variant !== null && !r.run.variant.complete) ||
      r.judging.refused > 0,
  );
  if (open.length === 0) return null;
  const ids = open.map((r) => r.q.id).join(", ");
  if (report)
    return `${open.length} questions have calls not made yet (${ids}); --report makes none`;
  return `the spending cap of ${usd(budget.capUsd)} was reached with ${open.length} questions not finished (${ids})`;
}

function writeSheet(
  records: readonly QuestionRecord[],
  best: ModelId | null,
  out: string,
  complete: boolean,
): { pairs: number; file: string | null; user: UserResult[] | null } {
  const keyFile = join(out, KEY_FILE);
  const gradesFile = join(out, GRADES_FILE);
  const sheetFile = join(out, SHEET_FILE);
  let key = existsSync(keyFile) ? (JSON.parse(readFileSync(keyFile, "utf8")) as SheetKey) : null;
  // The sheet only grows: the pairs of the key stay as they are, with the user's grades.
  if (complete) {
    const candidates = sheetCandidates(records, best);
    const questions = new Map(records.map((r) => [r.q.id, r.q]));
    mkdirSync(out, { recursive: true });
    if (!key) {
      key = { seed: SHEET_SEED, pairs: selectSheet(candidates) };
      writeFileSync(keyFile, `${JSON.stringify(key, null, 2)}\n`);
      writeFileSync(sheetFile, renderSheet(key, questions));
      writeFileSync(gradesFile, gradesTemplate(key.pairs.length));
    } else {
      const added = extendSheet(key, candidates);
      const first = added[0];
      const last = added[added.length - 1];
      if (first && last) {
        key = {
          ...key,
          pairs: [...key.pairs, ...added],
          added: [...(key.added ?? []), { from: first.n, to: last.n }],
        };
        writeFileSync(keyFile, `${JSON.stringify(key, null, 2)}\n`);
        writeFileSync(sheetFile, renderSheet(key, questions));
        if (existsSync(gradesFile)) {
          const text = readFileSync(gradesFile, "utf8");
          const end = text === "" || text.endsWith("\n") ? "" : "\n";
          writeFileSync(gradesFile, `${text}${end}${gradeSlots(first.n, last.n)}`);
        } else writeFileSync(gradesFile, gradesTemplate(last.n));
      }
    }
  }
  const grades = existsSync(gradesFile) ? parseGrades(readFileSync(gradesFile, "utf8")) : new Map();
  return {
    pairs: key?.pairs.length ?? 0,
    file: key ? sheetFile : null,
    user: key && grades.size > 0 ? userResults(key, grades) : null,
  };
}

/** Every pair the sheet may show: Q and T against the best single model, T against Q. */
function sheetCandidates(
  records: readonly QuestionRecord[],
  best: ModelId | null,
): SheetCandidate[] {
  const single = `S:${best}` as Arm;
  const arms = { qs: ["Q", single], tq: ["T", "Q"], ts: ["T", single] } as const;
  const candidates: SheetCandidate[] = [];
  for (const r of records) {
    if (!r.run?.complete) continue;
    const ts = tVsBestPair(r.answers, best);
    for (const p of [...pairSpecs(r.answers, best), ...(ts ? [ts] : [])]) {
      if (p.kind !== "qs" && p.kind !== "tq" && p.kind !== "ts") continue;
      const [firstArm, secondArm] = arms[p.kind];
      candidates.push({
        question: r.q.id,
        category: r.q.category,
        kind: p.kind,
        firstArm,
        secondArm,
        first: p.first,
        second: p.second,
      });
    }
  }
  return candidates;
}
