import {
  MODEL_NAMES,
  MODELS,
  type ModelId,
  type ModelSnapshot,
  type RunState,
  type Seat,
} from "@chebot/protocol";
import { type Check, criteria, type Share } from "./criteria.ts";
import {
  type Answers,
  ARMS,
  type Arm,
  type AuditChange,
  type AuditNote,
  type PairKind,
  sameText,
} from "./judge.ts";
import { CATEGORIES, type Question } from "./questions.ts";
import type { QuestionRun } from "./runs.ts";
import type { UserResult } from "./sheet.ts";
import { judgeAgreement, majorityCorrect, mean, plurality, type Spread, spread } from "./stats.ts";

// The report: every measure of "The evaluation of phase 1", computed from the records of the
// questions, and the criteria table. No model transcript: numbers, verdicts and short labels.

export interface StoredClassification {
  ok: boolean;
  class: "simple" | "complex";
  choice: "simple" | "complex" | null;
  probability: number | null;
  costUsd: number;
  latencyMs: number;
  reason: string | null;
}

export interface Grade {
  correct: boolean | null;
  quality: number;
}

export interface PairVerdict {
  preference: "first" | "second" | "tie";
  substance: "same" | "different";
}

export interface Verdicts {
  /** Per judge, per arm; a judge that abstained is absent. */
  grades: Partial<Record<ModelId, Partial<Record<Arm, Grade>>>>;
  /** The pairs asked, and per judge, per pair. */
  pairs: PairKind[];
  compare: Partial<Record<ModelId, Partial<Record<PairKind, PairVerdict>>>>;
  /** T against the best single model, an extra measure asked in calls of its own; per judge. */
  tVsBest: { asked: boolean; verdicts: Partial<Record<ModelId, PairVerdict>> };
  audit: {
    changes: AuditChange[];
    notes: AuditNote[];
    verdicts: Partial<
      Record<ModelId, { changes: Record<string, string>; notes: Record<string, string> }>
    >;
  };
  /** Judge calls not made (the cap was reached, or --report). */
  refused: number;
  /** Judge calls that abstained, per judge. */
  abstained: Partial<Record<ModelId, number>>;
}

export function emptyVerdicts(): Verdicts {
  return {
    grades: {},
    pairs: [],
    compare: {},
    tVsBest: { asked: false, verdicts: {} },
    audit: { changes: [], notes: [], verdicts: {} },
    refused: 0,
    abstained: {},
  };
}

export interface QuestionRecord {
  q: Question;
  key: string;
  run: QuestionRun | null;
  classification: StoredClassification | null;
  answers: Answers;
  judging: Verdicts;
}

export interface ReportContext {
  set: string;
  out: string;
  date: string;
  models: ModelSnapshot | null;
  questionsInSet: number;
  capUsd: number;
  spent: { runs: number; classify: number; judging: number };
  spentNow: { runs: number; classify: number; judging: number };
  /** Why the evaluation is incomplete; null when it is complete. */
  incomplete: string | null;
  bestSingle: { model: ModelId; why: string } | null;
  user: UserResult[] | null;
  sheet: { pairs: number; file: string | null };
}

type Tally3 = { first: number; tie: number; second: number; n: number };

export interface ReportData {
  context: ReportContext;
  coverage: { selected: number; covered: number; complete: boolean };
  correctness: {
    questions: number;
    arms: Record<Arm, Share>;
    agreement: ReturnType<typeof judgeAgreement>;
  };
  quality: { arms: Record<Arm, { mean: number | null; n: number }> };
  pairwise: {
    qVsBest: { majority: Tally3; perJudge: Partial<Record<ModelId, Tally3>>; bestMissing: number };
    tVsQ: { majority: Tally3; perJudge: Partial<Record<ModelId, Tally3>>; same: number };
    /** Extra, outside the criteria: T against the best single model. */
    tVsBest: {
      majority: Tally3;
      perJudge: Partial<Record<ModelId, Tally3>>;
      bestMissing: number;
      same: number;
    };
  };
  rounds: {
    contested: number;
    roundsRun: number;
    changed: number;
    improved: number;
    worsened: number;
    neutral: number;
  };
  herding: {
    changes: number;
    deference: number;
    newArgument: number;
    split: number;
    byModel: Partial<Record<ModelId, { changes: number; deference: number }>>;
    notes: Record<
      "kept" | "rejected",
      { notes: number; right: number; wrong: number; unclear: number }
    >;
  };
  editor: {
    withEditor: number;
    sameEditor: number;
    differ: number;
    rewrites: Record<"closest" | "rotation", { rewrites: number; kept: number; dropped: number }>;
    preference: Tally3;
  };
  soundness: {
    runs: number;
    completed: number;
    failed: { id: string; reason: string }[];
    flags: Record<string, number>;
    perSeat: Record<
      string,
      {
        calls: number;
        ok: number;
        invalid: number;
        timeout: number;
        refusal: number;
        error: number;
      }
    >;
    judges: Partial<Record<ModelId, { calls: number; abstained: number }>>;
  };
  cost: {
    arms: Record<Arm, { usd: Spread; ms: Spread }>;
    byClass: Record<
      "hand" | "classified",
      Record<
        "simple" | "complex",
        { questions: number; q: { usd: Spread; ms: Spread }; t: { usd: Spread; ms: Spread } }
      >
    >;
  };
  classifier: {
    classified: number;
    failed: number;
    agree: number;
    unsure: number;
    confusion: Record<"simple" | "complex", Record<"simple" | "complex" | "failed", number>>;
    usd: Spread;
    ms: Spread;
  };
  criteria: Check[];
  perQuestion: {
    id: string;
    category: string;
    hand: string;
    classified: string;
    status: string;
    contested: boolean;
    qCorrect: boolean | null;
    tCorrect: boolean | null;
    qVsBest: string;
    tVsQ: string;
    tVsBest: string;
    tUsd: number | null;
    tMs: number | null;
  }[];
}

// ---------------------------------------------------------------------------------------------

/** The judges' correctness verdict on an arm: missing answer is wrong; null without any judge. */
export function armCorrect(r: QuestionRecord, arm: Arm): boolean | null {
  if (r.q.gold === null) return null;
  const votes = MODELS.flatMap((j) => {
    const g = r.judging.grades[j]?.[arm];
    return g && g.correct !== null ? [g.correct] : [];
  });
  const judged = MODELS.some((j) => r.judging.grades[j] !== undefined);
  if (!judged) return null;
  if (r.answers.arms[arm] === null) return false;
  return majorityCorrect(votes);
}

/** The judges' mean quality of an arm (0 for a missing answer); null without any judge. */
export function armQuality(r: QuestionRecord, arm: Arm): number | null {
  if (!MODELS.some((j) => r.judging.grades[j] !== undefined)) return null;
  if (r.answers.arms[arm] === null) return 0;
  return mean(
    MODELS.flatMap((j) => {
      const g = r.judging.grades[j]?.[arm];
      return g ? [g.quality] : [];
    }),
  );
}

/**
 * The best single model, chosen after the fact: the best mean quality over the questions graded;
 * a tie goes to more correct answers, then to the fixed model order (Grok, Claude, OpenAI, Gemini).
 */
export function bestSingle(
  records: readonly QuestionRecord[],
): { model: ModelId; why: string } | null {
  const scored = MODELS.map((m) => {
    const arm = `S:${m}` as Arm;
    const qualities = records.flatMap((r) => armQuality(r, arm) ?? []);
    const correct = records.filter((r) => armCorrect(r, arm) === true).length;
    return { m, quality: mean(qualities), n: qualities.length, correct };
  });
  if (scored.every((s) => s.n === 0)) return null;
  const ranked = [...scored].sort(
    (a, b) =>
      (b.quality ?? -1) - (a.quality ?? -1) ||
      b.correct - a.correct ||
      MODELS.indexOf(a.m) - MODELS.indexOf(b.m),
  );
  const [best, next] = ranked;
  if (!best) return null;
  const tie = next && next.quality === best.quality;
  const why = `mean quality ${best.quality?.toFixed(2)} over ${best.n} questions${
    tie
      ? next.correct === best.correct
        ? ` (tied with ${MODEL_NAMES[next.m]} on quality and correct answers: the fixed model order decides)`
        : ` (tied with ${MODEL_NAMES[next.m]} on quality: more correct answers, ${best.correct} against ${next.correct})`
      : ""
  }`;
  return { model: best.m, why };
}

function majorityPair(r: QuestionRecord, kind: PairKind): PairVerdict["preference"] | null {
  const votes = MODELS.flatMap((j) => r.judging.compare[j]?.[kind]?.preference ?? []);
  return plurality(votes, "tie");
}

function substanceChanged(r: QuestionRecord): boolean | null {
  const votes = MODELS.flatMap((j) => r.judging.compare[j]?.tq?.substance ?? []);
  if (votes.length === 0) return null;
  return votes.filter((v) => v === "different").length > votes.filter((v) => v === "same").length;
}

function tally(values: readonly (PairVerdict["preference"] | null)[]): Tally3 {
  const t: Tally3 = { first: 0, tie: 0, second: 0, n: 0 };
  for (const v of values) {
    if (v === null) continue;
    t.n++;
    t[v]++;
  }
  return t;
}

function contestedAfterMerge(state: RunState | null): boolean {
  const seeded = state?.snapshots[0];
  return Object.values(seeded?.blocks ?? {}).some(
    (b) => b.kind === "paragraph" && b.status === "contested",
  );
}

/** The Q verdict against the best single model: a missing best draft is a Q win, a missing Q a loss. */
export function qVsBestVerdict(
  r: QuestionRecord,
  best: ModelId | null,
): PairVerdict["preference"] | null {
  if (!best || !r.run?.complete) return null;
  const q = r.answers.arms.Q;
  const s = r.answers.arms[`S:${best}`];
  if (q === null) return "second";
  if (s === null) return "first";
  if (sameText(q, s)) return "tie";
  return majorityPair(r, "qs");
}

export function tVsQVerdict(r: QuestionRecord): PairVerdict["preference"] | null {
  if (!r.run?.complete) return null;
  if (r.answers.arms.T === null || sameText(r.answers.arms.T, r.answers.arms.Q)) return null;
  return majorityPair(r, "tq");
}

/** The T verdict against the best single model, by the rules of Q against it. */
export function tVsBestVerdict(
  r: QuestionRecord,
  best: ModelId | null,
): PairVerdict["preference"] | null {
  if (!best || !r.run?.complete) return null;
  const t = r.answers.arms.T;
  const s = r.answers.arms[`S:${best}`];
  if (t === null) return "second";
  if (s === null) return "first";
  if (sameText(t, s)) return "tie";
  const votes = MODELS.flatMap((j) => r.judging.tVsBest.verdicts[j]?.preference ?? []);
  return plurality(votes, "tie");
}

const ms = (s: { latencyMs: number }) => s.latencyMs;

/** Cost and wall-clock of each arm of a run: a draft alone; drafts plus merge; the whole run. */
export function armCosts(run: QuestionRun): Partial<Record<Arm, { usd: number; ms: number }>> {
  const state = run.state;
  if (!state) return {};
  const out: Partial<Record<Arm, { usd: number; ms: number }>> = {};
  for (const m of MODELS) {
    const c = state.calls[`draft:0:${m}`];
    if (c) out[`S:${m}`] = { usd: c.costUsd, ms: c.latencyMs };
  }
  const calls = Object.values(state.calls);
  const quickUsd = calls
    .filter((c) => c.kind === "draft" || c.kind === "merge")
    .reduce((a, c) => a + c.costUsd, 0);
  const quickMs = run.steps
    .filter((s) => s.phase === "draft" || s.phase === "merge")
    .reduce((a, s) => a + ms(s), 0);
  out.Q = { usd: quickUsd, ms: quickMs };
  out.T = { usd: state.spentUsd, ms: run.wallMs };
  return out;
}

export function computeReport(
  records: readonly QuestionRecord[],
  context: ReportContext,
): ReportData {
  const covered = records.filter((r) => r.run?.complete && r.run.state);
  const complete = context.incomplete === null;
  const best = context.bestSingle?.model ?? null;

  // correctness
  const gold = covered.filter((r) => r.q.gold !== null && armCorrect(r, "Q") !== null);
  const correctArms = Object.fromEntries(
    ARMS.map((a) => [
      a,
      { hits: gold.filter((r) => armCorrect(r, a) === true).length, of: gold.length },
    ]),
  ) as Record<Arm, Share>;
  const agreement = judgeAgreement(
    gold.flatMap((r) =>
      ARMS.filter((a) => r.answers.arms[a] !== null).map((a) =>
        MODELS.map((j) => {
          const c = r.judging.grades[j]?.[a]?.correct;
          return c === undefined || c === null ? undefined : String(c);
        }),
      ),
    ),
  );

  // quality
  const qualityArms = Object.fromEntries(
    ARMS.map((a) => {
      const values = covered.flatMap((r) => armQuality(r, a) ?? []);
      return [a, { mean: mean(values), n: values.length }];
    }),
  ) as Record<Arm, { mean: number | null; n: number }>;

  // pairwise
  const perJudge = (kind: PairKind, rs: readonly QuestionRecord[]) =>
    Object.fromEntries(
      MODELS.map((j) => [
        j,
        tally(rs.map((r) => r.judging.compare[j]?.[kind]?.preference ?? null)),
      ]),
    ) as Partial<Record<ModelId, Tally3>>;
  const qsAsked = covered.filter((r) => r.judging.pairs.includes("qs"));
  const qVsBest = {
    majority: tally(covered.map((r) => qVsBestVerdict(r, best))),
    perJudge: perJudge("qs", qsAsked),
    bestMissing: best ? covered.filter((r) => r.answers.arms[`S:${best}`] === null).length : 0,
  };
  const differ = covered.filter((r) => tVsQVerdict(r) !== null || r.judging.pairs.includes("tq"));
  const tVsQ = {
    majority: tally(covered.map((r) => tVsQVerdict(r))),
    perJudge: perJudge("tq", differ),
    same: covered.filter((r) => sameText(r.answers.arms.T, r.answers.arms.Q)).length,
  };
  const tsAsked = covered.filter((r) => r.judging.tVsBest.asked);
  const tVsBest = {
    majority: tally(covered.map((r) => tVsBestVerdict(r, best))),
    perJudge: Object.fromEntries(
      MODELS.map((j) => [
        j,
        tally(tsAsked.map((r) => r.judging.tVsBest.verdicts[j]?.preference ?? null)),
      ]),
    ) as Partial<Record<ModelId, Tally3>>,
    bestMissing: qVsBest.bestMissing,
    same: best
      ? covered.filter((r) => sameText(r.answers.arms.T, r.answers.arms[`S:${best}`])).length
      : 0,
  };

  // rounds
  const contested = covered.filter((r) => contestedAfterMerge(r.run?.state ?? null));
  const rounds = {
    contested: contested.length,
    roundsRun: 0,
    changed: 0,
    improved: 0,
    worsened: 0,
    neutral: 0,
  };
  for (const r of contested) {
    if ((r.run?.state?.rounds.length ?? 0) > 0) rounds.roundsRun++;
    if (sameText(r.answers.arms.T, r.answers.arms.Q) || substanceChanged(r) !== true) continue;
    rounds.changed++;
    const v = tVsQVerdict(r);
    if (v === "first") rounds.improved++;
    else if (v === "second") rounds.worsened++;
    else rounds.neutral++;
  }

  // herding and dissent
  const herding: ReportData["herding"] = {
    changes: 0,
    deference: 0,
    newArgument: 0,
    split: 0,
    byModel: {},
    notes: {
      kept: { notes: 0, right: 0, wrong: 0, unclear: 0 },
      rejected: { notes: 0, right: 0, wrong: 0, unclear: 0 },
    },
  };
  for (const r of covered) {
    const a = r.judging.audit;
    for (const c of a.changes) {
      const verdict = plurality(
        MODELS.flatMap((j) => a.verdicts[j]?.changes[c.id] ?? []),
        "split",
      );
      if (verdict === null) continue;
      herding.changes++;
      const voter = c.id.split("/")[1] as ModelId;
      const byModel = slot(herding.byModel, voter, () => ({ changes: 0, deference: 0 }));
      byModel.changes++;
      if (verdict === "deference") {
        herding.deference++;
        byModel.deference++;
      } else if (verdict === "new_argument") herding.newArgument++;
      else herding.split++;
    }
    for (const n of a.notes) {
      const verdict = plurality(
        MODELS.flatMap((j) => a.verdicts[j]?.notes[n.id] ?? []),
        "unclear",
      );
      if (verdict === null) continue;
      const group = herding.notes[n.state === "rejected" ? "rejected" : "kept"];
      group.notes++;
      if (verdict === "right") group.right++;
      else if (verdict === "wrong") group.wrong++;
      else group.unclear++;
    }
  }

  // editor choice
  const withEditor = covered.filter((r) => r.run?.variant);
  const editor: ReportData["editor"] = {
    withEditor: withEditor.length,
    sameEditor: withEditor.filter((r) => r.run?.variant?.sameEditor).length,
    differ: 0,
    rewrites: {
      closest: { rewrites: 0, kept: 0, dropped: 0 },
      rotation: { rewrites: 0, kept: 0, dropped: 0 },
    },
    preference: tally(
      withEditor.map((r) =>
        r.answers.rotation !== null && !sameText(r.answers.arms.T, r.answers.rotation)
          ? majorityPair(r, "ed")
          : null,
      ),
    ),
  };
  for (const r of withEditor) {
    const v = r.run?.variant;
    if (!v?.complete) continue;
    if (!sameText(r.answers.arms.T, r.answers.rotation)) editor.differ++;
    const add = (policy: "closest" | "rotation", state: RunState | null) => {
      const e = state?.edit;
      if (!e) return;
      editor.rewrites[policy].rewrites += e.rewrites.length;
      editor.rewrites[policy].kept += e.kept.length;
      editor.rewrites[policy].dropped += e.rewrites.length - e.kept.length;
    };
    add("closest", r.run?.state ?? null);
    add("rotation", v.sameEditor ? (r.run?.state ?? null) : v.state);
  }

  // soundness
  const ran = records.filter((r) => r.run?.complete && r.run.state);
  const perSeat: ReportData["soundness"]["perSeat"] = {};
  const flags: Record<string, number> = {};
  for (const r of ran) {
    const state = r.run?.state as RunState;
    for (const c of Object.values(state.calls)) {
      const name = seatName(c.seat);
      const s = slot(perSeat, name, () => ({
        calls: 0,
        ok: 0,
        invalid: 0,
        timeout: 0,
        refusal: 0,
        error: 0,
      }));
      s.calls++;
      if (c.status === "ok") s.ok++;
      else s[c.reason ?? "error"]++;
    }
    for (const [flag, on] of Object.entries(state.flags))
      if (on) flags[flag] = (flags[flag] ?? 0) + 1;
  }
  const judges: ReportData["soundness"]["judges"] = {};
  for (const r of records) {
    for (const j of MODELS) {
      const answered =
        (r.judging.grades[j] ? 1 : 0) +
        (r.judging.compare[j] ? 1 : 0) +
        (r.judging.tVsBest.verdicts[j] ? 1 : 0) +
        (r.judging.audit.verdicts[j] ? 1 : 0);
      const abstained = r.judging.abstained[j] ?? 0;
      if (answered + abstained === 0) continue;
      const s = slot(judges, j, () => ({ calls: 0, abstained: 0 }));
      s.calls += answered + abstained;
      s.abstained += abstained;
    }
  }
  const soundness: ReportData["soundness"] = {
    runs: ran.length,
    completed: ran.filter((r) => r.run?.state?.status === "completed").length,
    failed: ran
      .filter((r) => r.run?.state?.status !== "completed")
      .map((r) => ({ id: r.q.id, reason: r.run?.state?.failure ?? "unknown" })),
    flags,
    perSeat,
    judges,
  };

  // cost and time
  const costs = ran.map((r) => ({ r, c: armCosts(r.run as QuestionRun) }));
  const armSpread = (rs: typeof costs, arm: Arm) => ({
    usd: spread(rs.flatMap((x) => x.c[arm]?.usd ?? [])),
    ms: spread(rs.flatMap((x) => x.c[arm]?.ms ?? [])),
  });
  const cost: ReportData["cost"] = {
    arms: Object.fromEntries(
      ARMS.map((a) => [a, armSpread(costs, a)]),
    ) as ReportData["cost"]["arms"],
    byClass: { hand: {} as never, classified: {} as never },
  };
  for (const by of ["hand", "classified"] as const) {
    for (const cls of ["simple", "complex"] as const) {
      const rs = costs.filter(({ r }) =>
        by === "hand" ? r.q.class === cls : r.classification?.class === cls,
      );
      cost.byClass[by][cls] = {
        questions: rs.length,
        q: armSpread(rs, "Q"),
        t: armSpread(rs, "T"),
      };
    }
  }

  // classifier
  const classified = records.filter((r) => r.classification);
  const confusion = {
    simple: { simple: 0, complex: 0, failed: 0 },
    complex: { simple: 0, complex: 0, failed: 0 },
  };
  for (const r of classified) {
    const c = r.classification as StoredClassification;
    confusion[r.q.class][c.ok ? c.class : "failed"]++;
  }
  const classifier: ReportData["classifier"] = {
    classified: classified.length,
    failed: classified.filter((r) => !r.classification?.ok).length,
    agree: classified.filter((r) => r.classification?.ok && r.classification.class === r.q.class)
      .length,
    unsure: classified.filter(
      (r) =>
        r.classification?.ok &&
        r.classification.choice === "simple" &&
        r.classification.class === "complex",
    ).length,
    confusion,
    usd: spread(classified.map((r) => r.classification?.costUsd ?? 0)),
    ms: spread(classified.map((r) => r.classification?.latencyMs ?? 0)),
  };

  // criteria
  const userQs = context.user?.find((u) => u.kind === "qs");
  const meanQ = cost.arms.Q.usd.mean;
  const meanT = cost.arms.T.usd.mean;
  const checks = criteria({
    complete,
    sound: { hits: soundness.completed, of: soundness.runs },
    fullP95Ms: cost.arms.T.ms.p95,
    correct:
      best && gold.length > 0
        ? { q: correctArms.Q.hits, best: correctArms[`S:${best}`].hits, of: gold.length }
        : null,
    qVsBestJudges: { hits: qVsBest.majority.first + qVsBest.majority.tie, of: qVsBest.majority.n },
    qVsBestUser:
      userQs && userQs.graded > 0
        ? { hits: userQs.firstWins + userQs.ties, of: userQs.graded }
        : null,
    rounds,
    costRatio: meanQ && meanT !== null ? meanT / meanQ : null,
    classifier: { hits: classifier.agree, of: classifier.classified },
  });

  const perQuestion = records.map((r) => {
    const c = r.run?.complete ? armCosts(r.run) : {};
    const qs = qVsBestVerdict(r, best);
    const tq = tVsQVerdict(r);
    const ts = tVsBestVerdict(r, best);
    const word = (v: string | null, first: string, second: string) =>
      v === null ? "" : v === "first" ? first : v === "second" ? second : "tie";
    return {
      id: r.q.id,
      category: r.q.category,
      hand: r.q.class,
      classified: r.classification ? (r.classification.ok ? r.classification.class : "failed") : "",
      status: r.run?.complete ? (r.run.state?.status ?? "") : r.run ? "incomplete" : "not run",
      contested: contestedAfterMerge(r.run?.state ?? null),
      qCorrect: armCorrect(r, "Q"),
      tCorrect: armCorrect(r, "T"),
      qVsBest: word(qs, "Q", "single"),
      tVsQ:
        r.run?.complete && sameText(r.answers.arms.T, r.answers.arms.Q)
          ? "same text"
          : word(tq, "T", "Q"),
      tVsBest:
        r.run?.complete && best && sameText(r.answers.arms.T, r.answers.arms[`S:${best}`])
          ? "same text"
          : word(ts, "T", "single"),
      tUsd: c.T?.usd ?? null,
      tMs: c.T?.ms ?? null,
    };
  });

  return {
    context,
    coverage: { selected: records.length, covered: covered.length, complete },
    correctness: { questions: gold.length, arms: correctArms, agreement },
    quality: { arms: qualityArms },
    pairwise: { qVsBest, tVsQ, tVsBest },
    rounds,
    herding,
    editor,
    soundness,
    cost,
    classifier,
    criteria: checks,
    perQuestion,
  };
}

/** The entry of `key`, created by `init` the first time. */
function slot<K extends string, V>(map: Partial<Record<K, V>>, key: K, init: () => V): V {
  const found = map[key];
  if (found !== undefined) return found;
  const created = init();
  map[key] = created;
  return created;
}

function seatName(seat: Seat): string {
  return seat === "utility" ? "utility" : MODEL_NAMES[seat];
}

// ---------------------------------------------------------------------------------------------
// Markdown

export function armName(arm: Arm): string {
  if (arm === "Q") return "Q (drafts and merge)";
  if (arm === "T") return "T (full protocol)";
  return `${MODEL_NAMES[arm.slice(2) as ModelId]} alone`;
}

const usd = (n: number | null) => (n === null ? "n/a" : `US$${n.toFixed(4)}`);
const sec = (n: number | null) => (n === null ? "n/a" : `${(n / 1000).toFixed(1)} s`);
const share = (s: Share) =>
  s.of === 0 ? "n/a" : `${s.hits} of ${s.of} (${((100 * s.hits) / s.of).toFixed(0)}%)`;
const percent = (hits: number, of: number) =>
  of === 0 ? "n/a" : `${((100 * hits) / of).toFixed(0)}%`;

const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

function table(head: string[], rows: (string | number)[][]): string {
  return [
    `| ${head.join(" | ")} |`,
    `| ${head.map(() => "---").join(" | ")} |`,
    ...rows.map((r) => `| ${r.join(" | ")} |`),
  ].join("\n");
}

function tallyRow(label: string, t: Tally3 | undefined, first: string, second: string): string[] {
  if (!t || t.n === 0) return [label, "0", "", "", "", ""];
  return [
    label,
    String(t.n),
    `${t.first} ${first}`,
    `${t.tie}`,
    `${t.second} ${second}`,
    percent(t.first + t.tie, t.n),
  ];
}

export function renderReport(d: ReportData): string {
  const c = d.context;
  const o: string[] = [];
  const spentTotal = c.spent.runs + c.spent.classify + c.spent.judging;
  o.push(`# Evaluation report: ${c.set}`, "");
  if (c.incomplete)
    o.push(
      `> [!WARNING]`,
      `> Incomplete: ${c.incomplete}. Checks that depend on it are pending.`,
      "",
    );
  o.push(
    `Written ${c.date}. It covers ${d.coverage.covered} of the ${d.coverage.selected} questions selected (${c.questionsInSet} in the set).`,
    "",
    `Spend of the evaluation so far: ${usd(spentTotal)}${Number.isFinite(c.capUsd) ? ` against a cap of ${usd(c.capUsd)}` : " (no cap applies)"}: runs ${usd(c.spent.runs)}, classification ${usd(c.spent.classify)}, judging ${usd(c.spent.judging)}. This invocation spent ${usd(c.spentNow.runs + c.spentNow.classify + c.spentNow.judging)}.`,
    "",
  );
  if (c.models) {
    o.push(
      table(
        ["Role", "Model"],
        Object.entries(c.models).map(([role, m]) => [
          role,
          `${m.id}${m.effort ? ` (${m.effort})` : ""}`,
        ]),
      ),
      "",
    );
  }

  o.push("## Criteria to go on", "");
  o.push(
    table(
      ["Area", "Check", "Measured", "Bar", "Result"],
      d.criteria.map((k) => [k.area, k.check, k.value, k.bar, k.status]),
    ),
    "",
  );

  o.push("## Correctness", "");
  o.push(
    `Over the ${d.correctness.questions} questions with a gold answer. Each arm's answer is right or wrong by the majority of the four judges; a tie is wrong, a missing answer is wrong.`,
    "",
  );
  o.push(
    table(
      ["Arm", "Correct"],
      ARMS.map((a) => [armName(a), share(d.correctness.arms[a])]),
    ),
    "",
  );
  const ag = d.correctness.agreement;
  o.push(
    `Agreement between judges: ${ag.share === null ? "n/a" : `${(100 * ag.share).toFixed(0)}%`} of judge pairs agree; ${ag.unanimous} of ${ag.items} answers were judged unanimously.`,
    "",
  );

  o.push("## Quality and the best single model", "");
  o.push(
    "Mean grade of the judges, from 1 to 5, over all questions graded; a missing answer counts 0.",
    "",
  );
  o.push(
    table(
      ["Arm", "Mean quality", "Questions"],
      ARMS.map((a) => [
        armName(a),
        d.quality.arms[a].mean?.toFixed(2) ?? "n/a",
        d.quality.arms[a].n,
      ]),
    ),
    "",
  );
  o.push(
    c.bestSingle
      ? `The best single model, chosen after the fact: **${MODEL_NAMES[c.bestSingle.model]}**, ${c.bestSingle.why}. Ties go to more correct answers, then to the fixed order Grok, Claude, OpenAI, Gemini.`
      : "No best single model yet: no question was graded.",
    "",
  );

  o.push("## Blind pairwise preference", "");
  const p = d.pairwise;
  const pairHead = ["Pair", "Questions", "First wins", "Ties", "Second wins", "First wins or ties"];
  const rows: string[][] = [
    tallyRow(
      "Q against the best single model, majority of judges",
      p.qVsBest.majority,
      "Q",
      "single",
    ),
  ];
  for (const j of MODELS)
    rows.push(tallyRow(`  judge ${MODEL_NAMES[j]}`, p.qVsBest.perJudge[j], "Q", "single"));
  rows.push(
    tallyRow("T against Q where they differ, majority of judges", p.tVsQ.majority, "T", "Q"),
  );
  for (const j of MODELS)
    rows.push(tallyRow(`  judge ${MODEL_NAMES[j]}`, p.tVsQ.perJudge[j], "T", "Q"));
  const userRow = (kind: UserResult["kind"], label: string, first: string, second: string) => {
    const u = c.user?.find((x) => x.kind === kind);
    if (u)
      rows.push(
        tallyRow(
          label,
          { first: u.firstWins, tie: u.ties, second: u.secondWins, n: u.graded },
          first,
          second,
        ),
      );
  };
  userRow("qs", "Q against the best single model, the user", "Q", "single");
  userRow("tq", "T against Q, the user", "T", "Q");
  rows.push(
    tallyRow(
      "T against the best single model (extra), majority of judges",
      p.tVsBest.majority,
      "T",
      "single",
    ),
  );
  for (const j of MODELS)
    rows.push(tallyRow(`  judge ${MODEL_NAMES[j]}`, p.tVsBest.perJudge[j], "T", "single"));
  userRow("ts", "T against the best single model (extra), the user", "T", "single");
  o.push(table(pairHead, rows), "");
  o.push(
    `The majority is the verdict of more judges than any other; otherwise a tie. Where the best single model had no answer, Q wins (${p.qVsBest.bestMissing} questions). T and Q have the same text on ${p.tVsQ.same} questions.`,
    "",
  );
  o.push(
    `T against the best single model is an extra measure, outside the criteria of the plan, whose check compares Q with the best single model; it follows the rules of that pair (T wins where the best single model had no answer, a tie where the texts are the same: ${p.tVsBest.same} questions).`,
    "",
  );
  o.push(
    c.user
      ? `The user graded ${c.user.reduce((a, u) => a + u.graded, 0)} of the ${c.sheet.pairs} pairs of the sheet.`
      : c.sheet.file
        ? `The user has not graded the sheet yet: ${c.sheet.file} (${c.sheet.pairs} pairs).`
        : "No grading sheet yet: it is written when the evaluation is complete.",
    "",
  );

  o.push("## The rounds", "");
  const r = d.rounds;
  o.push(
    table(
      ["Measure", "Value"],
      [
        ["Questions with contested paragraphs after the merge", r.contested],
        ["Of them, questions where rounds ran", r.roundsRun],
        [
          "The rounds changed the substance (majority of judges)",
          `${r.changed} (${percent(r.changed, r.contested)})`,
        ],
        ["Changes that improved the answer (T preferred)", r.improved],
        ["Changes that worsened it (Q preferred)", r.worsened],
        ["Changes judged a tie", r.neutral],
      ],
    ),
    "",
  );

  o.push("## Herding and dissent", "");
  const h = d.herding;
  o.push(
    `${count(h.changes, "vote")} changed position. By the majority of judges, ${h.newArgument} carried a new argument, ${h.deference} only deferred to the others, ${h.split} split the judges.`,
    "",
  );
  if (Object.keys(h.byModel).length > 0)
    o.push(
      table(
        ["Voter", "Changed votes", "Deferring"],
        MODELS.flatMap((m) =>
          h.byModel[m] ? [[MODEL_NAMES[m], h.byModel[m].changes, h.byModel[m].deference]] : [],
        ),
      ),
      "",
    );
  o.push(
    table(
      ["Suggestions not adopted", "Judged", "Right", "Wrong", "Unclear"],
      [
        [
          "Dissent notes (open or unresolved)",
          h.notes.kept.notes,
          h.notes.kept.right,
          h.notes.kept.wrong,
          h.notes.kept.unclear,
        ],
        [
          "Rejected suggestions",
          h.notes.rejected.notes,
          h.notes.rejected.right,
          h.notes.rejected.wrong,
          h.notes.rejected.unclear,
        ],
      ],
    ),
    "",
  );

  o.push("## Editor choice", "");
  const e = d.editor;
  o.push(
    `${count(e.withEditor, "run")} reached the editor. On ${e.sameEditor} both policies pick the same editor, so the finals are the same. The finals differ on ${e.differ}.`,
    "",
  );
  o.push(
    table(
      ["Policy", "Rewrites", "Kept by the check", "Dropped by the check"],
      (["closest", "rotation"] as const).map((k) => [
        k === "closest" ? "Closest to the majority" : "Rotation",
        e.rewrites[k].rewrites,
        e.rewrites[k].kept,
        e.rewrites[k].dropped,
      ]),
    ),
    "",
  );
  o.push(
    table(pairHead, [
      tallyRow(
        "Closest against rotation where the finals differ",
        e.preference,
        "closest",
        "rotation",
      ),
    ]),
    "",
  );

  o.push("## Soundness", "");
  const s = d.soundness;
  o.push(
    `${s.completed} of ${s.runs} runs completed${s.failed.length ? `; failed: ${s.failed.map((f) => `${f.id} (${f.reason})`).join(", ")}` : ""}. Flags raised: ${
      Object.entries(s.flags)
        .map(([f, n]) => `${f} ${n}`)
        .join(", ") || "none"
    }.`,
    "",
  );
  o.push(
    table(
      ["Seat", "Calls", "OK", "Invalid", "Timeout", "Refusal", "Error"],
      Object.entries(s.perSeat).map(([seat, x]) => [
        seat,
        x.calls,
        x.ok,
        x.invalid,
        x.timeout,
        x.refusal,
        x.error,
      ]),
    ),
    "",
  );
  if (Object.keys(s.judges).length > 0)
    o.push(
      table(
        ["Judge", "Calls", "Abstained"],
        MODELS.flatMap((j) =>
          s.judges[j] ? [[MODEL_NAMES[j], s.judges[j].calls, s.judges[j].abstained]] : [],
        ),
      ),
      "",
    );

  o.push("## Cost and wall-clock per question", "");
  o.push(
    "From the same runs: a draft's own call for each model alone; the drafts plus the merge for Q; the whole run for T. Wall-clock is the longest call of each step, summed.",
    "",
  );
  const spreadRow = (label: string, x: { usd: Spread; ms: Spread }) => [
    label,
    x.usd.n,
    usd(x.usd.mean),
    usd(x.usd.median),
    usd(x.usd.p95),
    sec(x.ms.median),
    sec(x.ms.p95),
  ];
  const costHead = [
    "",
    "Runs",
    "Mean cost",
    "Median cost",
    "95th pct cost",
    "Median time",
    "95th pct time",
  ];
  o.push(
    table(
      costHead,
      ARMS.map((a) => spreadRow(armName(a), d.cost.arms[a])),
    ),
    "",
  );
  const classRows: (string | number)[][] = [];
  for (const by of ["hand", "classified"] as const) {
    for (const cls of ["simple", "complex"] as const) {
      const x = d.cost.byClass[by][cls];
      classRows.push(spreadRow(`${cls} (${by === "hand" ? "hand-set" : "classifier"}), Q`, x.q));
      classRows.push(spreadRow(`${cls} (${by === "hand" ? "hand-set" : "classifier"}), T`, x.t));
    }
  }
  o.push(table(costHead, classRows), "");

  o.push("## The classifier", "");
  const k = d.classifier;
  o.push(
    `${k.agree} of ${k.classified} questions agree with the hand-set class (${percent(k.agree, k.classified)}). ${k.failed} classifications failed and count as complex; ${k.unsure} chose simple with a probability under 0.7 and count as complex. A classification costs ${usd(k.usd.median)} (median) and takes ${sec(k.ms.median)}.`,
    "",
  );
  o.push(
    table(
      ["Hand-set \\ classifier", "simple", "complex", "failed"],
      (["simple", "complex"] as const).map((h2) => [
        h2,
        k.confusion[h2].simple,
        k.confusion[h2].complex,
        k.confusion[h2].failed,
      ]),
    ),
    "",
  );

  o.push("## Per question", "");
  o.push(
    table(
      [
        "Question",
        "Category",
        "Hand-set",
        "Classifier",
        "Run",
        "Contested",
        "Q correct",
        "T correct",
        "Q vs single",
        "T vs Q",
        "T vs single",
        "T cost",
        "T time",
      ],
      d.perQuestion.map((x) => [
        x.id,
        x.category,
        x.hand,
        x.classified,
        x.status,
        x.contested ? "yes" : "",
        x.qCorrect === null ? "" : x.qCorrect ? "yes" : "no",
        x.tCorrect === null ? "" : x.tCorrect ? "yes" : "no",
        x.qVsBest,
        x.tVsQ,
        x.tVsBest,
        x.tUsd === null ? "" : usd(x.tUsd),
        x.tMs === null ? "" : sec(x.tMs),
      ]),
    ),
    "",
  );
  o.push(`Categories: ${CATEGORIES.join(", ")}.`, "");
  return `${o.join("\n")}`;
}
