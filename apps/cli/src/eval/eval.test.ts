import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hash } from "@chebot/protocol";
import {
  type Classification,
  type FakeOutcome,
  FakeProvider,
  type GenerateRequest,
} from "@chebot/providers";
import { describe, expect, test } from "vitest";
import { CATALOG, respond as runRespond } from "../fake-script.ts";
import { type EvalArgs, type EvalDeps, evaluate, parseEvalArgs } from "./eval.ts";
import { questionKey } from "./questions.ts";
import { bestSingle, emptyVerdicts, type QuestionRecord } from "./report.ts";
import { runId } from "./runs.ts";
import { GRADES_FILE, KEY_FILE, SHEET_FILE, type SheetKey } from "./sheet.ts";

// A small fake set: every question gets the scripted run of the fake provider (the Canberra run,
// which goes through every stage); the judges are scripted from their prompts.

const QUESTIONS = [
  { id: "e1", category: "stable_fact", class: "simple", gold: "Canberra.", rubric: null },
  { id: "e2", category: "contested", class: "complex", gold: null, rubric: "Shows both sides." },
  { id: "e3", category: "multi_step", class: "complex", gold: "About 460,000.", rubric: null },
  { id: "e4", category: "how_to", class: "simple", gold: null, rubric: "Clear steps." },
] as const;

function writeSet(ids: readonly string[] = QUESTIONS.map((q) => q.id)): string {
  const dir = mkdtempSync(join(tmpdir(), "chebot-eval-"));
  const file = join(dir, "set.jsonl");
  writeFileSync(
    file,
    QUESTIONS.filter((q) => ids.includes(q.id))
      .map((q) =>
        JSON.stringify({
          ...q,
          lang: "es",
          question: questionText(q.id),
          asOf: null,
          sources: [],
        }),
      )
      .join("\n"),
  );
  return file;
}

/**
 * e4 differs from the scripted run in two ways, so that its editors differ: its merge reports no
 * conflict (Grok, Claude and OpenAI then lead as closest to the majority, Gemini trails), and its
 * text makes the rotation of the run start at Gemini, whose edit words p1 its own way.
 */
function questionText(id: string): string {
  if (id !== "e4") return `¿Pregunta ${id} sobre Canberra?`;
  for (let n = 0; ; n++) {
    const text = `¿Pregunta ${id} sobre Canberra? (${n})`;
    if (hash(runId(questionKey({ id, question: text }))) % 4 === 3) return text;
  }
}

const labels = (prompt: string, heading: string) =>
  [...prompt.matchAll(new RegExp(`^## ${heading} (\\d+)$`, "gm"))].map((m) => m[1] ?? "");

/** The numbered blocks of a judge prompt: `<tag number="n">…</tag>`. */
function blocks(prompt: string, tag: string): { label: string; text: string }[] {
  const re = new RegExp(`<${tag} number="(\\d+)">([\\s\\S]*?)</${tag}>`, "g");
  return [...prompt.matchAll(re)].map((m) => ({ label: m[1] ?? "", text: m[2] ?? "" }));
}

/**
 * Graders: Claude's draft ("alrededor") is the best single answer; the one that says Sídney is
 * wrong. Pairs: the answer with the census figure wins, else the longer one.
 */
function judgeRespond(req: GenerateRequest<unknown>): FakeOutcome | null {
  const kind = req.callKey.split(":")[0];
  const out = (output: unknown): FakeOutcome => ({
    output,
    usage: { inputTokens: 1000, outputTokens: 100 },
    costUsd: 0.01,
  });
  if (kind === "gradeGold" || kind === "gradeRubric") {
    return out({
      grades: blocks(req.prompt, "answer").map(({ label: answer, text }) => {
        const wrong = text.includes("La capital de Australia es Sídney");
        const quality = wrong ? "2" : text.includes("alrededor") ? "5" : "4";
        return kind === "gradeGold"
          ? { answer, correct: wrong ? "incorrect" : "correct", quality }
          : { answer, quality };
      }),
    });
  }
  if (kind === "compare")
    return out({
      pairs: blocks(req.prompt, "pair").map(({ label: pair, text: block }) => {
        const a = /<answer_a>([\s\S]*)<\/answer_a>/.exec(block)?.[1] ?? "";
        const b = /<answer_b>([\s\S]*)<\/answer_b>/.exec(block)?.[1] ?? "";
        const text = (t: string) => t.trim();
        const score = (t: string) => (t.includes("censo") ? 1e6 : 0) + text(t).length;
        const preference = score(a) > score(b) ? "A" : score(b) > score(a) ? "B" : "tie";
        return { pair, substance: "different", preference };
      }),
    });
  if (kind === "audit")
    return out({
      changes: labels(req.prompt, "Change").map((item) => ({ item, verdict: "deference" })),
      suggestions: labels(req.prompt, "Suggestion").map((item) => ({ item, verdict: "right" })),
    });
  return null;
}

function fake(draftUsd?: number): FakeProvider {
  return new FakeProvider({
    respond: (req) => {
      const judged = judgeRespond(req);
      if (judged) return judged;
      const outcome = runRespond(req) as FakeOutcome & { output: Record<string, unknown> };
      if (draftUsd !== undefined && req.callKey.startsWith("draft:"))
        return { ...outcome, costUsd: draftUsd };
      if (req.callKey === "merge:0" && req.prompt.includes("Pregunta e4"))
        return { ...outcome, output: { ...outcome.output, conflicts: [] } };
      if (req.callKey === "edit:0:gemini")
        return {
          ...outcome,
          output: {
            paragraphs: [{ id: "p1", text: "Canberra es la capital (y no Sídney) de Australia." }],
          },
        };
      return outcome;
    },
  });
}

function deps(provider = fake()): EvalDeps & { provider: FakeProvider; classified: string[] } {
  const classified: string[] = [];
  return {
    provider,
    classified,
    catalog: async () => CATALOG,
    classify: async (req): Promise<Classification> => {
      classified.push(req.question);
      const simple = /e1|e3/.test(req.question);
      return {
        class: simple ? "simple" : "complex",
        choice: simple ? "simple" : "complex",
        probability: 0.9,
        usage: { inputTokens: 10, outputTokens: 1 },
        costUsd: 0.0005,
        latencyMs: 200,
      };
    },
    now: () => Date.UTC(2026, 10, 16, 12),
    progress: () => {},
  };
}

function args(set: string, extra: Partial<EvalArgs> = {}): EvalArgs {
  return {
    set,
    maxUsd: 50,
    runUsd: null,
    only: null,
    limit: null,
    concurrency: 2,
    report: false,
    out: join(set, "..", "out"),
    ...extra,
  };
}

const NAMES =
  /grok|claude|openai|chatgpt|gemini|anthropic|google|draft|merge|protocol|single model|\barm\b/i;

describe("parseEvalArgs", () => {
  test("reads every option", () => {
    expect(
      parseEvalArgs([
        "--set",
        "eval/questions.jsonl",
        "--max-usd",
        "5",
        "--only",
        "q03, q22",
        "--limit",
        "2",
        "--concurrency",
        "3",
        "--run-usd",
        "1.5",
        "--out",
        "x",
      ]),
    ).toEqual({
      set: "eval/questions.jsonl",
      maxUsd: 5,
      runUsd: 1.5,
      only: ["q03", "q22"],
      limit: 2,
      concurrency: 3,
      report: false,
      out: "x",
    });
    expect(parseEvalArgs(["--set", "s", "--max-usd", "1", "--only", "q03 q22,q29"])).toMatchObject({
      only: ["q03", "q22", "q29"],
    });
    expect(parseEvalArgs(["--set", "s.jsonl", "--report"])).toMatchObject({
      report: true,
      maxUsd: null,
      concurrency: 4,
    });
  });

  test("rejects a missing set or cap, bad numbers and stray arguments", () => {
    expect(parseEvalArgs([])).toHaveProperty("error");
    expect(parseEvalArgs(["--set", "s.jsonl"])).toHaveProperty("error");
    expect(parseEvalArgs(["--set", "s.jsonl", "--max-usd", "0"])).toHaveProperty("error");
    expect(parseEvalArgs(["--set", "s.jsonl", "--max-usd", "1", "--limit", "1.5"])).toHaveProperty(
      "error",
    );
    expect(parseEvalArgs(["--set", "s.jsonl", "--max-usd", "1", "extra"])).toHaveProperty("error");
  });
});

describe("an evaluation on a small fake set", async () => {
  const set = writeSet();
  const first = deps();
  const result = await evaluate(args(set), first);
  const out = result.out as string;
  const report = result.report;
  if (!report) throw new Error("no report");
  const md = readFileSync(join(out, "report.md"), "utf8");
  const judgePrompts = first.provider.calls.filter((c) => /^(grade|compare|audit)/.test(c.callKey));

  test("completes, covers every question and exits 0", () => {
    expect(result.code).toBe(0);
    expect(report.coverage).toEqual({ selected: 4, covered: 4, complete: true });
    expect(report.soundness).toMatchObject({ runs: 4, completed: 4 });
  });

  test("writes the report with every section, and its numbers as JSON", () => {
    for (const heading of [
      "## Criteria to go on",
      "## Correctness",
      "## Quality and the best single model",
      "## Blind pairwise preference",
      "## The rounds",
      "## Herding and dissent",
      "## Editor choice",
      "## Soundness",
      "## Cost and wall-clock per question",
      "## The classifier",
      "## Per question",
    ])
      expect(md).toContain(heading);
    expect(md).toContain("It covers 4 of the 4 questions selected");
    expect(md).toMatch(/runs US\$[\d.]+, classification US\$[\d.]+, judging US\$[\d.]+/);
    const json = JSON.parse(readFileSync(join(out, "report.json"), "utf8"));
    expect(json.criteria).toHaveLength(9);
    expect(json.coverage.covered).toBe(4);
  });

  test("measures the arms from the same runs", () => {
    // The draft that says Sídney is wrong; every other arm is right, on the 2 gold questions.
    expect(report.correctness.questions).toBe(2);
    expect(report.correctness.arms["S:gemini"]).toEqual({ hits: 0, of: 2 });
    expect(report.correctness.arms.Q).toEqual({ hits: 2, of: 2 });
    expect(report.correctness.arms["S:claude"]).toEqual({ hits: 2, of: 2 });
    expect(report.cost.arms["S:grok"].usd.median).toBe(0.05);
    expect(report.cost.arms.Q.usd.median).toBeCloseTo(0.201);
    expect(report.cost.arms.T.usd.median).toBeGreaterThan(0.201);
    expect(report.rounds.contested).toBe(4);
    expect(report.rounds.changed).toBe(4);
    expect(report.rounds.improved).toBe(4);
    expect(report.herding.changes).toBeGreaterThan(0);
    expect(report.herding.deference).toBe(report.herding.changes);
    // e3 (complex) is classified simple, e4 (simple) complex.
    expect(report.classifier).toMatchObject({ classified: 4, agree: 2 });
    expect(report.classifier.confusion).toEqual({
      simple: { simple: 1, complex: 1, failed: 0 },
      complex: { simple: 1, complex: 1, failed: 0 },
    });
  });

  test("picks the best single model after the fact, and compares Q with it", () => {
    expect(report.context.bestSingle?.model).toBe("claude");
    const compare = judgePrompts.filter((c) => c.callKey.startsWith("compare"));
    expect(compare).toHaveLength(16);
    for (const c of compare)
      expect(c.prompt).toContain("En Canberra viven alrededor de 460.000 personas.");
  });

  test("finishes the runs with the other editor where the editors differ", () => {
    expect(report.editor.withEditor).toBe(4);
    expect(report.editor.sameEditor).toBe(3);
    expect(report.editor.differ).toBe(1);
    expect(report.editor.preference.n).toBe(1);
    expect(report.editor.rewrites.closest).toEqual({ rewrites: 8, kept: 4, dropped: 4 });
    expect(report.editor.rewrites.rotation).toEqual({ rewrites: 7, kept: 4, dropped: 3 });
    const e4 = join(
      set,
      "..",
      "results",
      "raw",
      "set",
      questionKey({ id: "e4", question: questionText("e4") }),
    );
    expect(existsSync(join(e4, "editor-rotation.jsonl"))).toBe(true);
  });

  test("judge prompts carry no model or arm name, and use no search", () => {
    expect(judgePrompts.length).toBeGreaterThan(0);
    for (const c of judgePrompts) {
      expect(`${c.system}\n${c.prompt}`).not.toMatch(NAMES);
      expect(c.search).toBeUndefined();
    }
    const judges = new Set(judgePrompts.map((c) => c.model.id));
    expect([...judges].sort()).toEqual([
      "anthropic/claude-opus-5.5",
      "google/gemini-4-argon",
      "openai/gpt-6.1-sol",
      "spacexai/grok-4.7",
    ]);
  });

  test("writes the grading sheet without labels of origin, and a grades file with empty slots", () => {
    const sheet = readFileSync(join(out, SHEET_FILE), "utf8");
    const key = JSON.parse(readFileSync(join(out, KEY_FILE), "utf8")) as SheetKey;
    expect(key.pairs.length).toBe(8); // 4 questions × (Q against Claude, T against Q)
    expect(sheet).toContain("## Pair 8");
    expect(sheet).toContain(GRADES_FILE);
    expect(sheet).not.toMatch(NAMES);
    expect(sheet).not.toMatch(/firstArm|"Q"|S:|T \(/);
    expect(readFileSync(join(out, GRADES_FILE), "utf8")).toContain("\n8: \n");
  });

  test("a rerun makes no provider call, asks the same prompts and pays nothing", async () => {
    const again = deps();
    const rerun = await evaluate(args(set), again);
    expect(again.provider.calls).toEqual([]);
    expect(again.classified).toEqual([]);
    expect(rerun.code).toBe(0);
    expect(rerun.report?.context.spentNow).toEqual({ runs: 0, classify: 0, judging: 0 });
    for (const kind of ["runs", "classify", "judging"] as const)
      expect(rerun.report?.context.spent[kind]).toBeCloseTo(report.context.spent[kind], 9);
    expect(rerun.report?.criteria).toEqual(report.criteria);
  });

  test("--report rebuilds from disk; the user's grades reach the report", async () => {
    const key = JSON.parse(readFileSync(join(out, KEY_FILE), "utf8")) as SheetKey;
    // The user prefers Q (or T) in every pair, whatever side it is on.
    writeFileSync(
      join(out, GRADES_FILE),
      key.pairs.map((p) => `${p.n}: ${p.firstIsA ? "A" : "b"}`).join("\n"),
    );
    const offline = deps(new FakeProvider());
    offline.catalog = async () => {
      throw new Error("no catalog in --report");
    };
    const rebuilt = await evaluate(args(set, { report: true, maxUsd: null }), offline);
    expect(offline.provider.calls).toEqual([]);
    expect(rebuilt.code).toBe(0);
    const user = rebuilt.report?.context.user ?? [];
    expect(user.find((u) => u.kind === "qs")).toMatchObject({ graded: 4, firstWins: 4 });
    expect(user.find((u) => u.kind === "tq")).toMatchObject({ graded: 4, firstWins: 4 });
    const userCheck = rebuilt.report?.criteria.find((c) => c.check.endsWith("by the user"));
    expect(userCheck).toMatchObject({ status: "pass", value: "100% (4 of 4)" });
    expect(readFileSync(join(out, "report.md"), "utf8")).toContain(
      "The user graded 8 of the 8 pairs",
    );
  });
});

describe("the spending cap", () => {
  test("stops the evaluation, marks the report incomplete; a rerun resumes where it stopped", async () => {
    const set = writeSet(["e1"]);
    // Drafts at their worst case (US$0.25 each): room for the classification, the drafts and the
    // merge under US$1.10; round 1 does not fit.
    const capped = deps(fake(0.25));
    const stopped = await evaluate(args(set, { maxUsd: 1.1, concurrency: 1 }), capped);
    expect(stopped.code).toBe(1);
    expect(stopped.report?.coverage.complete).toBe(false);
    expect(stopped.report?.criteria.every((c) => c.status === "pending")).toBe(true);
    const md = readFileSync(join(stopped.out as string, "report.md"), "utf8");
    expect(md).toContain("Incomplete: the spending cap of US$1.1000 was reached");
    expect(existsSync(join(stopped.out as string, SHEET_FILE))).toBe(false);
    const made = capped.provider.calls.map((c) => c.callKey);
    expect(made).toEqual(expect.arrayContaining(["draft:0:grok", "merge:0"]));
    expect(made.some((k) => k.startsWith("round:"))).toBe(false);
    const spent = stopped.report?.context.spent;
    expect((spent?.runs ?? 0) + (spent?.classify ?? 0)).toBeLessThanOrEqual(1.1);

    // A second invocation under a cap already used up starts nothing.
    const still = deps();
    expect((await evaluate(args(set, { maxUsd: 0.3 }), still)).code).toBe(1);
    expect(still.provider.calls).toEqual([]);

    const resumed = deps();
    const done = await evaluate(args(set, { maxUsd: 50 }), resumed);
    expect(done.code).toBe(0);
    const again = resumed.provider.calls
      .map((c) => c.callKey)
      .filter((k) => !/^(grade|compare|audit)/.test(k));
    expect(again.filter((k) => made.includes(k))).toEqual([]);
    expect(again).toEqual(expect.arrayContaining(["round:1:grok"]));
    expect(resumed.classified).toEqual([]);
    expect(done.report?.context.spent.runs).toBeCloseTo(
      (stopped.report?.context.spent.runs ?? 0) + (done.report?.context.spentNow.runs ?? 0),
    );
  });
});

describe("the best single model", () => {
  const record = (
    id: string,
    grades: Record<string, number>,
    correct: Record<string, boolean>,
  ): QuestionRecord => {
    const judging = emptyVerdicts();
    judging.grades.grok = Object.fromEntries(
      Object.entries(grades).map(([m, quality]) => [
        `S:${m}`,
        { correct: correct[m] ?? null, quality },
      ]),
    );
    return {
      q: {
        id,
        category: "stable_fact",
        lang: "es",
        question: id,
        class: "simple",
        gold: "x",
        rubric: null,
      },
      key: questionKey({ id, question: id }),
      run: null,
      classification: null,
      answers: {
        arms: { "S:grok": "a", "S:claude": "b", "S:openai": "c", "S:gemini": "d", Q: "e", T: "e" },
        rotation: null,
      },
      judging,
    };
  };

  test("is the best mean quality; ties go to more correct answers, then to the model order", () => {
    const grades = { grok: 3, claude: 4, openai: 5, gemini: 4 };
    expect(bestSingle([record("a", grades, {})])?.model).toBe("openai");
    const tied = { grok: 4, claude: 4, openai: 4, gemini: 4 };
    expect(
      bestSingle([record("a", tied, { gemini: true, grok: false, claude: false, openai: false })])
        ?.model,
    ).toBe("gemini");
    expect(bestSingle([record("a", tied, {})])).toMatchObject({ model: "grok" });
    expect(bestSingle([record("a", tied, {})])?.why).toContain("fixed model order");
  });
});
