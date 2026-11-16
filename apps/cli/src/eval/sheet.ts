import { seededShuffle } from "@chebot/protocol";
import type { Arm } from "./judge.ts";
import { CATEGORIES, type Category, type Question, reference } from "./questions.ts";

// The user's blind grading sheet: answer pairs chosen with a fixed seed, shown as A and B without
// any label of origin. The key (which answer is which) stays in a separate file.

export const SHEET_SIZE = 20;
export const SHEET_SEED = "grading-sheet-v1";
export const SHEET_FILE = "grading-sheet.md";
export const GRADES_FILE = "grades.txt";
export const KEY_FILE = "grading-key.json";

/** A pair the sheet may show: Q against the best single model, or T against Q where they differ. */
export interface SheetCandidate {
  question: string;
  category: Category;
  kind: "qs" | "tq";
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
}

/**
 * Up to `size` pairs, half of each kind when there are enough (the rest from the other kind),
 * spread over the categories in turn, a question used once before any is used twice.
 */
export function selectSheet(
  candidates: readonly SheetCandidate[],
  size = SHEET_SIZE,
  seed = SHEET_SEED,
): SheetPair[] {
  const byKind = (kind: SheetCandidate["kind"]) =>
    seededShuffle(
      candidates.filter((c) => c.kind === kind),
      `${seed}|${kind}`,
    );
  const tq = byKind("tq");
  const qs = byKind("qs");
  const tqCount = Math.min(tq.length, Math.max(Math.floor(size / 2), size - qs.length));
  const qsCount = Math.min(qs.length, size - tqCount);
  const used = new Set<string>();
  const chosen = [
    ...spread(tq, tqCount, used, `${seed}|tq`),
    ...spread(qs, qsCount, used, `${seed}|qs`),
  ];
  return seededShuffle(chosen, `${seed}|order`).map((c, i) => ({
    ...c,
    n: i + 1,
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

export function renderSheet(
  pairs: readonly SheetPair[],
  questions: ReadonlyMap<string, Question>,
): string {
  const out: string[] = [
    "# Blind grading sheet",
    "",
    `${pairs.length} pairs of answers to questions of the evaluation. In each pair, which answer is A and which is B was decided at random, and nothing tells where an answer comes from.`,
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
  const lines = [
    "# Your grades for grading-sheet.md: after each number, write A, B or tie.",
    ...Array.from({ length: count }, (_, i) => `${i + 1}: `),
  ];
  return `${lines.join("\n")}\n`;
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
  kind: "qs" | "tq";
  graded: number;
  firstWins: number;
  ties: number;
  secondWins: number;
}

/** The user's grades by kind of pair, through the key. */
export function userResults(key: SheetKey, grades: ReadonlyMap<number, UserChoice>): UserResult[] {
  return (["qs", "tq"] as const).map((kind) => {
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
