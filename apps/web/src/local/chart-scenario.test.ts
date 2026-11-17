import { selectAnswer, selectChart } from "@chebot/protocol";
import { describe, expect, it } from "vitest";
import { CHART_QUESTION } from "./chart-scenario.ts";
import { playChart } from "./play.ts";
import { SCENARIO_QUESTION } from "./scenario.ts";

describe.concurrent("the scripted runs of the local mode", () => {
  it("the chart question: text and two charts; agreed rows, a row settled by its source, a range, a lone value, voted layers", async () => {
    const view = await playChart(CHART_QUESTION);
    expect(view.status).toBe("completed");
    expect(view.snapshots.at(-1)?.order).toEqual(["p1", "c1", "p2", "c2"]);
    expect(selectAnswer(view)?.paragraphs).toHaveLength(2);
    const chart = selectChart(view, "c1");
    expect(chart?.rows.map((r) => [r.key, r.status, r.values.value])).toEqual([
      ["2025-01", "agreed", 2.2],
      ["2025-02", "agreed", 2.4],
      ["2025-03", "held", 3.7],
      ["2025-04", "agreed", 2.8],
      ["2025-05", "unsettled", 1.9],
      ["2025-06", "unverified", 1.6],
    ]);
    // March was drawn at the value two models gave, then the source settled it
    expect(selectChart(view, "c1", 1)?.rows[2]?.values.value).toBe(3.3);
    expect(chart?.title).toBe("Inflación mensual en la Argentina, enero a junio de 2025");
    expect(Object.values(view.threads).map((t) => [t.lockKey, t.state])).toEqual([
      ["c1/title", "accepted"],
      ["c1/caption", "accepted"],
      ["c1/encoding", "unresolved"],
    ]);
    expect(view.versions.map((v) => [v.version, v.cause, v.threads])).toEqual([
      [1, "merge", []],
      [2, "round", []],
      [3, "round", ["t1", "t2"]],
    ]);
    expect(chart?.dissent.map((d) => d.author)).toEqual(["gemini"]);
    const wages = selectChart(view, "c2");
    expect(wages?.rows.map((r) => [r.key, r.status])).toEqual([
      ["2025-01", "agreed"],
      ["2025-02", "agreed"],
      ["2025-03", "agreed"],
    ]);
    expect(view.declined.map((d) => [d.models, d.why])).toEqual([[["claude"], "one_draft"]]);
    expect(view.renders.every((r) => r.ok)).toBe(true);
    expect(view.moments.some((m) => /marzo/.test(m.text))).toBe(true);
  }, 60_000);

  it("any other question: the drafts propose no chart, the answer is text", async () => {
    const view = await playChart(SCENARIO_QUESTION);
    expect(view.status).toBe("completed");
    expect(view.snapshots.at(-1)?.order.every((id) => id.startsWith("p"))).toBe(true);
    expect(view.renders).toEqual([]);
  }, 60_000);
});
