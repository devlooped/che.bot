import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CATALOG, respondUserChart, respondWebChart, SALES_CSV } from "@chebot/driver/testing";
import { FakeProvider, type FakeResponder } from "@chebot/providers";
import { describe, expect, test } from "vitest";
import { type AskArgs, type AskDeps, ask, parseAskArgs } from "./ask.ts";

// A scripted chart run through the CLI driver, with the real render gate (Vega in interpreter mode).

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
  chart: { csv: null },
  ...extra,
});

describe("ask --chart", () => {
  test("parses --chart and --csv (which implies --chart)", () => {
    expect(parseAskArgs(["q", "--chart"])).toMatchObject({ chart: { csv: null } });
    expect(parseAskArgs(["q", "--csv", "datos.csv"])).toMatchObject({
      chart: { csv: "datos.csv" },
    });
    expect(parseAskArgs(["q"])).not.toHaveProperty("chart");
  });

  test("web data: writes the spec, the rows with their sources and the SVG of every version", async () => {
    const d = deps(respondWebChart);
    const result = await ask(args(), d);
    expect(result.code).toBe(0);
    const dir = result.dir as string;
    const spec = JSON.parse(readFileSync(join(dir, "chart.vl.json"), "utf8"));
    expect(spec.data.values.map((v: { key: string }) => v.key)).toEqual([
      "2026-01",
      "2026-03",
      "2026-05",
    ]);
    const rows = JSON.parse(readFileSync(join(dir, "rows.json"), "utf8"));
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
    const versions = result.run?.state.snapshots.map((s) => s.version) ?? [];
    expect(versions).toEqual([1, 2, 3]);
    for (const v of versions)
      expect(readFileSync(join(dir, `chart-v${v}.svg`), "utf8")).toMatch(/^<svg/);
    // the patch that did not render never reached a vote
    expect(result.run?.state.chart?.dropped.map((d) => d.why)).toEqual([
      "theme_only",
      "render_failed",
    ]);
    expect(Object.values(result.run?.state.suggestions ?? {}).map((s) => s.target.layer)).toEqual([
      "encoding",
    ]);
    expect(result.message).toContain("Chart (version 3, data from the web)");
    expect(result.message).toContain("2026-05");
    expect(result.message).toContain("unsettled (range 3.5 to 3.7)");
    expect(result.message).toContain("Rows dropped from the briefs: Claude 2026-06 (no_citation)");
    expect(result.message).toContain("d1 2026-03: held (v1)");
    expect(result.message).toMatch(/Cost: US\$/);
    // every model call once
    expect(result.run?.calls.every((c) => c.status === "ok")).toBe(true);
    expect(d.provider.repeated()).toEqual([]);
  });

  test("user data: every number of the chart is computed from the file, never typed by a model", async () => {
    const dir = mkdtempSync(join(tmpdir(), "chebot-csv-"));
    const csv = join(dir, "ventas.csv");
    writeFileSync(csv, SALES_CSV);
    const result = await ask(
      args({ question: "¿Cuánto vendió cada región?", chart: { csv } }),
      deps(respondUserChart),
    );
    expect(result.code).toBe(0);
    const out = result.dir as string;
    const spec = JSON.parse(readFileSync(join(out, "chart.vl.json"), "utf8"));
    expect(spec.data.values).toEqual([
      { region: "Norte", mes: "2026-01", ventas: 100 },
      { region: "Norte", mes: "2026-02", ventas: 150 },
      { region: "Sur", mes: "2026-01", ventas: 80 },
      { region: "Sur", mes: "2026-02", ventas: 95.5 },
      { region: "Oeste", mes: "2026-01", ventas: 40 },
    ]);
    expect(spec.encoding.y).toEqual({
      field: "total",
      type: "quantitative",
      title: "Ventas totales",
    });
    expect(result.run?.state.chart?.dropped.map((d) => [d.layer, d.why])).toEqual([
      ["data", "user_data"],
    ]);
    expect(result.message).toContain("Rows: 5 uploaded rows");
    expect(existsSync(join(out, "chart-v2.svg"))).toBe(true);
    expect(readFileSync(join(out, "chart-v2.svg"), "utf8")).toContain("Ventas totales");
  });

  test("a CSV beyond the limits is refused before any call", async () => {
    const dir = mkdtempSync(join(tmpdir(), "chebot-csv-"));
    const csv = join(dir, "malo.csv");
    writeFileSync(csv, "a,b\n1");
    const d = deps(respondUserChart);
    const result = await ask(args({ chart: { csv } }), d);
    expect(result).toMatchObject({
      code: 2,
      message: expect.stringContaining("The CSV cannot be used"),
    });
    expect(d.provider.calls).toHaveLength(0);
  });
});
