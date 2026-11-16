import { describe, expect, test } from "vitest";
import { CATEGORIES } from "./questions.ts";
import {
  extendSheet,
  type SheetCandidate,
  type SheetKey,
  type SheetKind,
  selectSheet,
  userResults,
} from "./sheet.ts";

const ARMS = {
  qs: ["Q", "S:claude"],
  tq: ["T", "Q"],
  ts: ["T", "S:claude"],
} as const;

/** One candidate of each kind for every question: `<category>-<i>`, `perCategory` per category. */
function candidates(perCategory: number, kinds: readonly SheetKind[] = ["qs", "tq", "ts"]) {
  const out: SheetCandidate[] = [];
  for (const category of CATEGORIES)
    for (let i = 0; i < perCategory; i++)
      for (const kind of kinds)
        out.push({
          question: `${category}-${i}`,
          category,
          kind,
          firstArm: ARMS[kind][0],
          secondArm: ARMS[kind][1],
          first: `${kind} first ${category}-${i}`,
          second: `${kind} second ${category}-${i}`,
        });
  return out;
}

const count = (pairs: readonly { kind: SheetKind }[], kind: SheetKind) =>
  pairs.filter((p) => p.kind === kind).length;

describe("a sheet from scratch", () => {
  test("carries the three kinds: 7 Q against single, 6 T against Q, 7 T against single", () => {
    const pairs = selectSheet(candidates(5));
    expect(pairs.map((p) => p.n)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect([count(pairs, "qs"), count(pairs, "tq"), count(pairs, "ts")]).toEqual([7, 6, 7]);
    for (const category of CATEGORIES)
      expect(pairs.some((p) => p.category === category)).toBe(true);
    expect(selectSheet(candidates(5))).toEqual(pairs);
  });

  test("gives what a kind lacks to the others", () => {
    const pool = [
      ...candidates(5, ["qs", "ts"]),
      ...candidates(1, ["tq"]).filter((c) => c.category === "how_to"),
    ];
    const pairs = selectSheet(pool);
    expect(pairs).toHaveLength(20);
    expect(count(pairs, "tq")).toBe(1);
    expect(count(pairs, "qs") + count(pairs, "ts")).toBe(19);
  });
});

describe("appending to a sheet", () => {
  const all = candidates(4);
  // A sheet of 12 pairs of the two first kinds, on two questions of each category.
  const old = selectSheet(
    all.filter((c) => c.kind !== "ts" && /-[01]$/.test(c.question)),
    { qs: 6, tq: 6, ts: 0 },
  );
  const key: SheetKey = { seed: "grading-sheet-v1", pairs: old };
  const seen = new Set(old.map((p) => p.question));

  test("appends the kind the key lacks, numbered after it, questions not shown yet first", () => {
    const added = extendSheet(key, all, 12);
    expect(added.map((p) => p.n)).toEqual(Array.from({ length: 12 }, (_, i) => 13 + i));
    expect(added.every((p) => p.kind === "ts")).toBe(true);
    expect(added.filter((p) => seen.has(p.question))).toEqual([]);
    for (const category of CATEGORIES)
      expect(added.filter((p) => p.category === category)).toHaveLength(2);
    expect(extendSheet(key, all, 12)).toEqual(added);
  });

  test("uses a question already shown only when the fresh ones run out", () => {
    const added = extendSheet(key, all, 18);
    expect(added).toHaveLength(18);
    expect(added.filter((p) => !seen.has(p.question))).toHaveLength(12);
  });

  test("appends nothing to a key that has every kind", () => {
    const full: SheetKey = { ...key, pairs: [...old, ...extendSheet(key, all, 12)] };
    expect(extendSheet(full, all, 12)).toEqual([]);
  });

  test("the user's grades are counted by kind, the new kind too", () => {
    const added = extendSheet(key, all, 2);
    const full: SheetKey = { ...key, pairs: [...old, ...added] };
    const grades = new Map(added.map((p) => [p.n, p.firstIsA ? "A" : "B"] as const));
    expect(userResults(full, grades).find((u) => u.kind === "ts")).toEqual({
      kind: "ts",
      graded: 2,
      firstWins: 2,
      ties: 0,
      secondWins: 0,
    });
  });
});
