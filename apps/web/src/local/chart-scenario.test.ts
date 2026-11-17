import { selectChart } from "@chebot/protocol";
import { describe, expect, it } from "vitest";
import { CHART_QUESTION, SAMPLE_CSV, UPLOAD_QUESTION } from "./chart-scenario.ts";
import { playChart } from "./play.ts";

describe.concurrent("the scripted chart runs of the local mode", () => {
  it("web data: agreed rows, a row settled by its source, a range, a lone value, voted layers", async () => {
    const view = await playChart(CHART_QUESTION, null);
    expect(view.status).toBe("completed");
    const chart = selectChart(view);
    expect(chart?.rows.map((r) => [r.key, r.status, r.values.value])).toEqual([
      ["2025-01", "agreed", 2.2],
      ["2025-02", "agreed", 2.4],
      ["2025-03", "held", 3.7],
      ["2025-04", "agreed", 2.8],
      ["2025-05", "unsettled", 1.9],
      ["2025-06", "unverified", 1.6],
    ]);
    // March was drawn at the value two models gave, then the source settled it
    expect(selectChart(view, 1)?.rows[2]?.values.value).toBe(3.3);
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
    expect(view.renders.every((r) => r.ok)).toBe(true);
    expect(view.moments.some((m) => /marzo/.test(m.text))).toBe(true);
    expect(view.snapshots.length).toBeGreaterThanOrEqual(3);
  }, 60_000);

  it("user data: every row is the upload; the axis title and the caption are voted in", async () => {
    const view = await playChart(UPLOAD_QUESTION, SAMPLE_CSV);
    expect(view.status).toBe("completed");
    const chart = selectChart(view);
    expect(chart?.origin).toBe("user");
    expect(chart?.rows.every((r) => r.status === "upload")).toBe(true);
    expect(Object.values(view.threads).map((t) => [t.lockKey, t.state])).toEqual([
      ["c1/encoding", "accepted"],
      ["c1/caption", "accepted"],
      ["c1/transform", "rejected"],
    ]);
    expect(view.renders.every((r) => r.ok)).toBe(true);
  }, 60_000);
});
