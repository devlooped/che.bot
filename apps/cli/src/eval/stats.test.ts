import { describe, expect, test } from "vitest";
import { type CriteriaInput, criteria } from "./criteria.ts";
import {
  judgeAgreement,
  majorityCorrect,
  mean,
  median,
  percentile,
  plurality,
  pool,
} from "./stats.ts";

describe("statistics", () => {
  test("mean, median and the nearest-rank 95th percentile", () => {
    expect(mean([])).toBeNull();
    expect(mean([1, 2, 6])).toBe(3);
    expect(median([])).toBeNull();
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    const hundred = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(hundred, 95)).toBe(95);
    expect(percentile([10, 20, 30], 95)).toBe(30);
    expect(percentile([7], 95)).toBe(7);
    expect(
      percentile(
        Array.from({ length: 20 }, (_, i) => 20 - i),
        95,
      ),
    ).toBe(19);
    expect(percentile([], 95)).toBeNull();
  });

  test("plurality: the verdict of more votes than any other, else the tie value", () => {
    expect(plurality([], "tie")).toBeNull();
    expect(plurality(["first", "first", "second", "tie"], "tie")).toBe("first");
    expect(plurality(["first", "second"], "tie")).toBe("tie");
    expect(plurality(["first", "first", "second", "second"], "tie")).toBe("tie");
    expect(plurality(["tie", "tie", "first"], "tie")).toBe("tie");
    expect(plurality(["deference"], "split")).toBe("deference");
  });

  test("majority of correctness: a tie is wrong", () => {
    expect(majorityCorrect([])).toBeNull();
    expect(majorityCorrect([true, true, false])).toBe(true);
    expect(majorityCorrect([true, true, false, false])).toBe(false);
    expect(majorityCorrect([false])).toBe(false);
  });

  test("agreement between judges counts agreeing pairs and unanimous items", () => {
    const a = judgeAgreement([
      ["true", "true", "true", "true"],
      ["true", "false", "true", undefined],
      ["false", undefined, undefined, undefined],
    ]);
    // item 1: 6 pairs agree; item 2: 3 pairs, 1 agrees; item 3: a single verdict, not counted
    expect(a).toEqual({ items: 2, unanimous: 1, pairs: 9, agreeing: 7, share: 7 / 9 });
  });

  test("the pool runs at most `limit` at once and keeps the order", async () => {
    let running = 0;
    let peak = 0;
    const out = await pool([5, 1, 3, 2, 4], 2, async (n) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, n));
      running--;
      return n * 10;
    });
    expect(out).toEqual([50, 10, 30, 20, 40]);
    expect(peak).toBe(2);
  });
});

describe("criteria", () => {
  const passing: CriteriaInput = {
    complete: true,
    sound: { hits: 48, of: 50 },
    fullP95Ms: 175_000,
    correct: { q: 20, best: 19, of: 28 },
    qVsBestJudges: { hits: 31, of: 50 },
    qVsBestUser: { hits: 6, of: 10 },
    rounds: { contested: 20, changed: 6, improved: 4, worsened: 2 },
    costRatio: 2.5,
    classifier: { hits: 43, of: 50 },
  };

  test("every bar met passes", () => {
    expect(criteria(passing).map((c) => c.status)).toEqual(Array(9).fill("pass"));
  });

  test("each bar fails just below it", () => {
    const failing = criteria({
      ...passing,
      sound: { hits: 47, of: 50 },
      fullP95Ms: 180_000,
      correct: { q: 18, best: 19, of: 28 },
      qVsBestJudges: { hits: 29, of: 50 },
      qVsBestUser: { hits: 5, of: 10 },
      rounds: { contested: 20, changed: 5, improved: 3, worsened: 2 },
      costRatio: 2.51,
      classifier: { hits: 42, of: 50 },
    });
    expect(failing.map((c) => c.status)).toEqual(Array(9).fill("fail"));
    expect(failing[0]).toMatchObject({ value: "94% (47 of 50)", bar: "at least 95%" });
  });

  test("an incomplete evaluation, or a missing user grade, is pending", () => {
    expect(criteria({ ...passing, complete: false }).every((c) => c.status === "pending")).toBe(
      true,
    );
    const ungraded = criteria({ ...passing, qVsBestUser: null });
    expect(ungraded[4]).toMatchObject({ status: "pending", value: "not graded yet" });
    expect(ungraded.filter((c) => c.status === "pending")).toHaveLength(1);
  });

  test("no regression and no improvement does not pass the rounds", () => {
    const none = criteria({
      ...passing,
      rounds: { contested: 10, changed: 3, improved: 0, worsened: 0 },
    });
    expect(none[6]?.status).toBe("fail");
  });
});
