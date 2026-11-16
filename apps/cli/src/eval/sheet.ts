import { seededShuffle } from "@chebot/protocol";
import type { Arm } from "./judge.ts";
import { CATEGORIES, type Category, type Question, reference } from "./questions.ts";

// The user's blind grading sheet: answer pairs chosen with a fixed seed, shown as A and B without
// any label of origin. The key (which answer is which) stays in a separate file. The sheet only
// grows: its pairs never change once written, and a kind of pair its key lacks is appended.

export const SHEET_SIZE = 20;
export const SHEET_SEED = "grading-sheet-v1";
export const SHEET_FILE = "grading-sheet.md";
export const GRADES_FILE = "grades.txt";
export const KEY_FILE = "grading-key.json";

/** Q against the best single model, T against Q, T against the best single model. */
export type SheetKind = "qs" | "tq" | "ts";
export const SHEET_KINDS: readonly SheetKind[] = ["tq", "qs", "ts"];

/**
 * The pairs of each kind on a sheet built from scratch: Q against the best single model carries
 * the criterion checked by the user, and T against the best single model is the question the
 * protocol answers in the end, so they get one pair more than T against Q.
 */
export const SHEET_SPLIT: Readonly<Record<SheetKind, number>> = { qs: 7, tq: 6, ts: 7 };

/** A pair the sheet may show, where the two answers differ. */
export interface SheetCandidate {
  question: string;
  category: Category;
  kind: SheetKind;
  firstArm: Arm;
  secondArm: Arm;
  first: string;
  second: string;
}

export interface SheetPair extends SheetCandidate {
  n: number;
  firstIsA: boolean;
}

export interface SheetKey {
  seed: string;
  pairs: SheetPair[];
  /** The pairs appended after the sheet was first written, by range of numbers. */
  added?: { from: number; to: number }[];
}

/**
 * A sheet from scratch: the pairs of each kind its split gives (what a kind lacks goes to the
 * others), spread over the categories in turn, a question used once before any is used twice.
 */
export function selectSheet(
  candidates: readonly SheetCandidate[],
  split: Readonly<Record<SheetKind, number>> = SHEET_SPLIT,
  seed = SHEET_SEED,
): SheetPair[] {
  const pools = new Map(SHEET_KINDS.map((kind) => [kind, poolOf(candidates, kind, seed)]));
  const counts = new Map(
    SHEET_KINDS.map((kind) => [kind, Math.min(split[kind], pools.get(kind)?.length ?? 0)]),
  );
  let left = SHEET_KINDS.reduce((a, k) => a + split[k], 0) - sum(counts);
  for (const kind of SHEET_KINDS) {
    const more = Math.min(left, (pools.get(kind)?.length ?? 0) - (counts.get(kind) ?? 0));
    counts.set(kind, (counts.get(kind) ?? 0) + more);
    left -= more;
  }
  const used = new Set<string>();
  const chosen = SHEET_KINDS.flatMap((kind) =>
    spread(pools.get(kind) ?? [], counts.get(kind) ?? 0, used, `${seed}|${kind}`),
  );
  return numbered(seededShuffle(chosen, `${seed}|order`), 1, seed);
}

/**
 * The pairs to append to a sheet for each kind its key does not have yet: up to `size` of the
 * kind, numbered after the last pair, spread over the categories and taken first from questions
 * the sheet does not show yet. The pairs already in the key never change.
 */
export function extendSheet(
  key: SheetKey,
  candidates: readonly SheetCandidate[],
  size = SHEET_SIZE,
  seed = SHEET_SEED,
): SheetPair[] {
  const have = new Set(key.pairs.map((p) => p.kind));
  const used = new Set(key.pairs.map((p) => p.question));
  let next = key.pairs.reduce((a, p) => Math.max(a, p.n), 0) + 1;
  const out: SheetPair[] = [];
  for (const kind of SHEET_KINDS) {
    if (have.has(kind)) continue;
    const pool = poolOf(candidates, kind, seed);
    const chosen = spread(pool, Math.min(size, pool.length), used, `${seed}|${kind}`);
    const pairs = numbered(seededShuffle(chosen, `${seed}|${kind}|order`), next, seed);
    out.push(...pairs);
    next += pairs.length;
  }
  return out;
}

function poolOf(candidates: readonly SheetCandidate[], kind: SheetKind, seed: string) {
  return seededShuffle(
    candidates.filter((c) => c.kind === kind),
    `${seed}|${kind}`,
  );
}

function sum(counts: ReadonlyMap<SheetKind, number>): number {
  return [...counts.values()].reduce((a, n) => a + n, 0);
}

function numbered(chosen: readonly SheetCandidate[], from: number, seed: string): SheetPair[] {
  return chosen.map((c, i) => ({
    ...c,
    n: from + i,
    firstIsA: seededShuffle([true, false], `${seed}|${c.question}|${c.kind}`)[0] as boolean,
  }));
}

function spread(
  pool: readonly SheetCandidate[],
  count: number,
  used: Set<string>,
  seed: string,
): SheetCandidate[] {
  const out: SheetCandidate[] = [];
  const left = [...pool];
  const order = seededShuffle(CATEGORIES, seed);
  for (const fresh of [true, false]) {
    let progress = true;
    while (out.length < count && progress) {
      progress = false;
      for (const category of order) {
        if (out.length >= count) break;
        const i = left.findIndex(
          (c) => c.category === category && (!fresh || !used.has(c.question)),
        );
        if (i < 0) continue;
        const [c] = left.splice(i, 1);
        if (!c) continue;
        out.push(c);
        used.add(c.question);
        progress = true;
      }
    }
  }
  return out;
}

function quoted(text: string): string {
  return text
    .split(/\r?\n/)
    .map((l) => (l.trim() === "" ? ">" : `> ${l}`))
    .join("\n");
}

export function renderSheet(key: SheetKey, questions: ReadonlyMap<string, Question>): string {
  const pairs = key.pairs;
  const added = (key.added ?? []).map(
    (a) => ` Pairs ${a.from} to ${a.to} were added later and are graded the same way.`,
  );
  const out: string[] = [
    "# Blind grading sheet",
    "",
    `${pairs.length} pairs of answers to questions of the evaluation. In each pair, which answer is A and which is B was decided at random, and nothing tells where an answer comes from.${added.join("")}`,
    "",
    "For each pair: read the question and the reference (open it with a click), then answers A and B, and decide which one serves the reader better: correct first, then complete, fair and clear.",
    "",
    `Write your choice in \`${GRADES_FILE}\`, next to this file: one line per pair, \`A\`, \`B\` or \`tie\` after its number (\`7: B\`). Leave a line empty to skip a pair. Then rebuild the report with \`pnpm cli eval --set <set> --report --out <this folder>\`: it reads your grades and makes no model call.`,
  ];
  for (const p of pairs) {
    const q = questions.get(p.question);
    const ref = q ? reference(q) : null;
    out.push(
      "",
      "---",
      "",
      `## Pair ${p.n}`,
      "",
      `**Question:** ${q?.question ?? p.question}`,
      "",
      `<details><summary>${ref?.kind === "gold" ? "Reference answer" : "Grading guide"}</summary>`,
      "",
      ref?.text ?? "",
      "",
      "</details>",
      "",
      "### Answer A",
      "",
      quoted(p.firstIsA ? p.first : p.second),
      "",
      "### Answer B",
      "",
      quoted(p.firstIsA ? p.second : p.first),
    );
  }
  return `${out.join("\n")}\n`;
}

export function gradesTemplate(count: number): string {
  return `# Your grades for grading-sheet.md: after each number, write A, B or tie.\n${gradeSlots(1, count)}`;
}

/** Empty grade lines for pairs `from` to `to`, one per line. */
export function gradeSlots(from: number, to: number): string {
  return Array.from({ length: to - from + 1 }, (_, i) => `${from + i}: \n`).join("");
}

export type UserChoice = "A" | "B" | "tie";

/** The grades written in the grades file, by pair number; lines left empty are skipped. */
export function parseGrades(text: string): Map<number, UserChoice> {
  const out = new Map<number, UserChoice>();
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(\d+)\s*[:=.)-]?\s*(a|b|tie|empate)\s*$/i.exec(line);
    if (!m) continue;
    const choice = (m[2] ?? "").toLowerCase();
    out.set(Number(m[1]), choice === "a" ? "A" : choice === "b" ? "B" : "tie");
  }
  return out;
}

export interface UserResult {
  kind: SheetKind;
  graded: number;
  firstWins: number;
  ties: number;
  secondWins: number;
}

/** The user's grades by kind of pair, through the key. */
export function userResults(key: SheetKey, grades: ReadonlyMap<number, UserChoice>): UserResult[] {
  return (["qs", "tq", "ts"] as const).map((kind) => {
    const r: UserResult = { kind, graded: 0, firstWins: 0, ties: 0, secondWins: 0 };
    for (const p of key.pairs) {
      if (p.kind !== kind) continue;
      const g = grades.get(p.n);
      if (!g) continue;
      r.graded++;
      if (g === "tie") r.ties++;
      else if ((g === "A") === p.firstIsA) r.firstWins++;
      else r.secondWins++;
    }
    return r;
  });
}
