// The criteria to go on, from "The evaluation of phase 1": per check, the measured value, the bar,
// and pass, fail or pending (pending when the evaluation is incomplete or the user's grades are
// missing).

export type CheckStatus = "pass" | "fail" | "pending";

export interface Check {
  area: string;
  check: string;
  value: string;
  bar: string;
  status: CheckStatus;
}

export interface Share {
  hits: number;
  of: number;
}

export interface CriteriaInput {
  complete: boolean;
  /** Runs that finished without an invalid output stopping them, of the runs made. */
  sound: Share;
  /** The 95th percentile of the full protocol's wall-clock, in ms. */
  fullP95Ms: number | null;
  /** Correct answers of Q and of the best single model, over the questions with a gold answer. */
  correct: { q: number; best: number; of: number } | null;
  /** Pairs Q against the best single model that Q won or tied, by the judges and by the user. */
  qVsBestJudges: Share;
  qVsBestUser: Share | null;
  rounds: { contested: number; changed: number; improved: number; worsened: number };
  /** Mean cost of T over mean cost of Q. */
  costRatio: number | null;
  classifier: Share;
}

const pct = (s: Share) =>
  s.of === 0 ? "n/a" : `${((100 * s.hits) / s.of).toFixed(0)}% (${s.hits} of ${s.of})`;

function status(complete: boolean, measured: boolean, passed: boolean): CheckStatus {
  if (!complete || !measured) return "pending";
  return passed ? "pass" : "fail";
}

export function criteria(input: CriteriaInput): Check[] {
  const c = input.complete;
  const checks: Check[] = [];
  const soundShare = input.sound.of ? input.sound.hits / input.sound.of : 0;
  checks.push({
    area: "The protocol is sound",
    check: "Runs that finish without an invalid output stopping them",
    value: pct(input.sound),
    bar: "at least 95%",
    status: status(c, input.sound.of > 0, soundShare >= 0.95),
  });
  checks.push({
    area: "The protocol is sound",
    check: "Wall-clock of the full protocol, 95th percentile",
    value: input.fullP95Ms === null ? "n/a" : `${(input.fullP95Ms / 1000).toFixed(1)} s`,
    bar: "under 180 s",
    status: status(c, input.fullP95Ms !== null, (input.fullP95Ms ?? Infinity) < 180_000),
  });
  checks.push({
    area: "Collaboration beats one model",
    check: "Correct answers: Q against the best single model",
    value: input.correct
      ? `${input.correct.q} against ${input.correct.best} (of ${input.correct.of})`
      : "n/a",
    bar: "Q no fewer",
    status: status(
      c,
      input.correct !== null && input.correct.of > 0,
      (input.correct?.q ?? 0) >= (input.correct?.best ?? Infinity),
    ),
  });
  const judges = input.qVsBestJudges;
  checks.push({
    area: "Collaboration beats one model",
    check: "Blind pairs Q won or tied against the best single model, by the judges",
    value: pct(judges),
    bar: "at least 60%",
    status: status(c, judges.of > 0, judges.hits >= 0.6 * judges.of),
  });
  const user = input.qVsBestUser;
  checks.push({
    area: "Collaboration beats one model",
    check: "Blind pairs Q won or tied against the best single model, by the user",
    value: user ? pct(user) : "not graded yet",
    bar: "at least 60%",
    status: status(c, user !== null && user.of > 0, (user?.hits ?? 0) >= 0.6 * (user?.of ?? 0)),
  });
  const r = input.rounds;
  checks.push({
    area: "The rounds earn their cost",
    check: "Questions with contested paragraphs whose substance the rounds changed",
    value: pct({ hits: r.changed, of: r.contested }),
    bar: "at least 30%",
    status: status(c, r.contested > 0, r.changed >= 0.3 * r.contested),
  });
  checks.push({
    area: "The rounds earn their cost",
    check: "Improvements against regressions",
    value: `${r.improved} against ${r.worsened}`,
    bar: "2 to 1 or better",
    status: status(c, r.contested > 0, r.improved > 0 && r.improved >= 2 * r.worsened),
  });
  checks.push({
    area: "The rounds earn their cost",
    check: "Mean cost of T over mean cost of Q",
    value: input.costRatio === null ? "n/a" : `${input.costRatio.toFixed(2)}×`,
    bar: "at most 2.5×",
    status: status(c, input.costRatio !== null, (input.costRatio ?? Infinity) <= 2.5),
  });
  const k = input.classifier;
  checks.push({
    area: "The classifier can set the price",
    check: "Agreement with the hand-set class",
    value: pct(k),
    bar: "at least 85%",
    status: status(c, k.of > 0, k.hits >= 0.85 * k.of),
  });
  return checks;
}
