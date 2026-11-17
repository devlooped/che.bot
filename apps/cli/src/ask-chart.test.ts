import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CATALOG, respondWebChart } from "@chebot/driver/testing";
import { FakeProvider, type FakeResponder } from "@chebot/providers";
import { describe, expect, test } from "vitest";
import { type AskArgs, type AskDeps, ask, parseAskArgs } from "./ask.ts";

// A scripted run whose answer has a chart, through the CLI driver, with the real render gate (Vega
// in interpreter mode).

function deps(respond: FakeResponder): AskDeps & { provider: FakeProvider } {
  let t = 1_800_000_000_000;
  return {
    provider: new FakeProvider({ respond }),
    catalog: async () => CATALOG,
    classify: async () => ({
      class: "complex",
      choice: "complex",
      probability: 0.9,
      usage: { inputTokens: 10, outputTokens: 1 },
      costUsd: 0.0002,
      latencyMs: 300,
    }),
    now: () => (t += 100),
    runId: () => "0f8e7d6c-0000-4000-8000-000000000000",
    progress: () => {},
  };
}

const args = (extra: Partial<AskArgs> = {}): AskArgs => ({
  question: "¿Cuál fue la inflación mensual de Argentina en 2026?",
  mode: "thorough",
  maxUsd: null,
  out: mkdtempSync(join(tmpdir(), "chebot-chart-")),
  ...extra,
});

describe("ask, with charts", () => {
  test("there is no option to ask for a chart: the drafts decide", () => {
    expect(parseAskArgs(["q"])).toEqual({
      question: "q",
      mode: "thorough",
      maxUsd: null,
      out: ".runs",
    });
    expect(parseAskArgs(["q", "--chart"])).toHaveProperty("error");
    expect(parseAskArgs(["q", "--csv", "datos.csv"])).toHaveProperty("error");
  });

  test("prints the text and the chart; writes the spec, the rows with their sources and the SVG of every version", async () => {
    const d = deps(respondWebChart);
    const result = await ask(args(), d);
    expect(result.code).toBe(0);
    const dir = result.dir as string;
    const spec = JSON.parse(readFileSync(join(dir, "chart-c1.vl.json"), "utf8"));
    expect(spec.data.values.map((v: { key: string }) => v.key)).toEqual([
      "2026-01",
      "2026-03",
      "2026-05",
    ]);
    const rows = JSON.parse(readFileSync(join(dir, "rows-c1.json"), "utf8"));
    expect(
      rows.rows.map((r: { key: string; status: string; source: { url: string } }) => [
        r.key,
        r.status,
        r.source.url,
      ]),
    ).toEqual([
      ["2026-01", "agreed", "https://indec.gob.ar/ipc-enero"],
      ["2026-03", "held", "https://indec.gob.ar/ipc-marzo"],
      ["2026-05", "unsettled", "https://consultora.example/mayo"],
    ]);
    const state = result.run?.state;
    expect(state?.snapshots.at(-1)?.order).toEqual(["p1", "c1", "p2"]);
    const versions = state?.snapshots.map((s) => s.version) ?? [];
    expect(versions).toEqual([1, 2, 3]);
    for (const v of versions)
      expect(readFileSync(join(dir, `chart-c1-v${v}.svg`), "utf8")).toMatch(/^<svg/);
    // the patch that did not render never reached a vote
    expect(state?.charts.dropped.map((d) => d.why)).toEqual(["theme_only", "render_failed"]);
    expect(Object.values(state?.suggestions ?? {}).map((s) => s.target.layer)).toEqual([
      "encoding",
    ]);
    expect(result.message).toContain("[p1] agreed");
    expect(result.message).toContain("Chart c1 (version 3)");
    expect(result.message).toContain("unsettled (range 3.5 to 3.7)");
    expect(result.message).toContain("Rows dropped from the drafts: Claude 2026-06 (no_citation)");
    expect(result.message).toContain("d1 2026-03: held (v1)");
    expect(result.message).toMatch(/Cost: US\$/);
    // every model call once
    expect(result.run?.calls.every((c) => c.status === "ok")).toBe(true);
    expect(d.provider.repeated()).toEqual([]);
  });
});
