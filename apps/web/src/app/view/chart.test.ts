import type { RunView } from "@chebot/protocol";
import { compile } from "vega-lite";
import { beforeAll, describe, expect, it } from "vitest";
import { CHART_QUESTION, SAMPLE_CSV, UPLOAD_QUESTION } from "../../local/chart-scenario.ts";
import { playChart } from "../../local/play.ts";
import { localTime } from "../chart/spec.ts";
import { esAR as t } from "../i18n/es-AR.ts";
import {
  chartHistoryOf,
  chartViewOf,
  describeTransform,
  drawnColumns,
  keyLabel,
  patchText,
} from "./chart.ts";
import { stageLine } from "./derive.ts";

let web: RunView;
let user: RunView;

beforeAll(async () => {
  [web, user] = await Promise.all([
    playChart(CHART_QUESTION, null),
    playChart(UPLOAD_QUESTION, SAMPLE_CSV),
  ]);
}, 60_000);

describe("the chart of web data", () => {
  it("says how each row ended, and numbers the notes of the rows to read", () => {
    const chart = chartViewOf(web);
    expect(chart?.rows.map((r) => [r.label, r.kind, r.text, r.note])).toEqual([
      ["enero de 2025", "agreed", "2,2", null],
      ["febrero de 2025", "agreed", "2,4", null],
      ["marzo de 2025", "corrected", "3,7", 1],
      ["abril de 2025", "agreed", "2,8", null],
      ["mayo de 2025", "range", "de 1,5 a 1,9", 2],
      ["junio de 2025", "lone", "1,6", 3],
    ]);
    // every web row opens its citation
    expect(chart?.rows.every((r) => r.source?.url.startsWith("https://") && r.quote)).toBe(true);
  });

  it("tells a corrected point: what it was, what it is, the source that settled it, who said what", () => {
    const march = chartViewOf(web)?.rows[2];
    expect(march?.noteText).toBe(t.chart.notes.corrected("3,3", "3,7"));
    expect(march?.settledBy?.url).toMatch(/indec\.gob\.ar/);
    expect(march?.values.map((v) => [v.text, v.support, v.verdict])).toEqual([
      ["3,3", ["claude", "openai"], "failed"],
      ["3,7", ["grok"], "held"],
    ]);
  });

  it("draws a disputed point as a range with both values and their sources", () => {
    const chart = chartViewOf(web);
    const may = chart?.rows[4];
    expect(may?.noteText).toBe(t.chart.notes.range("1,5", "1,9"));
    expect(may?.values.map((v) => [v.text, v.source?.url])).toEqual([
      ["1,9", "https://www.ecolatina.com/informes/precios-mayo-2025"],
      ["1,5", "https://www.estadisticaciudad.gob.ar/eyc/?p=ipcba-mayo-2025"],
    ]);
    expect(chart?.data[4]).toMatchObject({ value: null, low: 1.5, high: 1.9, note: "2", at: 1.9 });
    // the dates of the axis are local times, so that March is March west of Greenwich
    expect(chart?.data[2]?.key).toBe(localTime("2025-03"));
    expect(chart?.rows[5]?.noteText).toBe(t.chart.notes.loneUnverified("Gemini"));
  });

  it("opens the discussions of the voted layers, and keeps the dissent in plain words", () => {
    const chart = chartViewOf(web);
    expect(chart?.layers.map((l) => [l.layer, l.state, l.value, l.before])).toEqual([
      ["encoding", "unresolved", expect.stringMatching(/^Gráfico de líneas\./), null],
      [
        "title",
        "accepted",
        "Inflación mensual en la Argentina, enero a junio de 2025",
        "Inflación mensual de 2025",
      ],
      [
        "caption",
        "accepted",
        expect.stringMatching(/rango/),
        "La inflación de cada mes según el INDEC.",
      ],
    ]);
    expect(chart?.dissent.map((d) => [d.author, d.layer, d.action, d.keep])).toEqual([
      ["gemini", "encoding", t.chart.patch.mark("de barras"), ["grok", "openai"]],
    ]);
  });

  it("has a history: the merged data, the rows the sources settled, the layers the votes changed", () => {
    const steps = chartHistoryOf(web);
    expect(steps.map((s) => s.label)).toEqual([
      t.history.steps.merge,
      t.chart.history.steps.sources,
      t.history.steps.round(2),
    ]);
    expect(steps[1]?.changes.map((c) => (c.kind === "row" ? c.text : c.name))).toEqual([
      t.chart.history.row.corrected("marzo de 2025", "3,3", "3,7"),
      t.chart.history.row.range("mayo de 2025", "1,5", "1,9"),
      t.chart.history.row.lone("junio de 2025"),
    ]);
    expect(steps[2]?.changes.map((c) => (c.kind === "layer" ? [c.name, c.by] : c.text))).toEqual([
      [t.chart.layers.names.title, "claude"],
      [t.chart.layers.names.caption, "openai"],
    ]);
    // the earlier version draws March at the value two models gave
    expect(chartViewOf(web, steps[0]?.version)?.rows[2]?.text).toBe("3,3");
  });

  it("closes with a stage line of the rows", () => {
    expect(stageLine(web)).toBe(
      t.stage.chart.done({ rows: 6, agreed: 3, settled: 1, ranges: 1, lone: 1 }),
    );
    expect(stageLine(web)).toMatch(/^Listo\./);
  });

  it("composes a spec that Vega-Lite compiles, with one title on the axis of the values", () => {
    const spec = chartViewOf(web)?.spec(300) ?? {};
    expect(spec.title).toBeUndefined();
    const compiled = compile(spec as never).spec as { axes?: { title?: unknown }[] };
    const titles = (compiled.axes ?? []).map((a) => a.title).filter(Boolean);
    expect(titles).toContain("Inflación mensual (%)");
    expect(titles.join(" ")).not.toMatch(/low|high|\bat\b/);
  });
});

describe("the chart of the user's table", () => {
  it("says the calculation in plain words and which columns the drawing shows", () => {
    const chart = chartViewOf(user);
    expect(chart?.origin).toBe("user");
    expect(chart?.calculation).toBe("la suma de «ventas» por «sucursal»");
    expect(chart?.upload?.rows).toHaveLength(12);
    expect(chart ? drawnColumns(chart.chart) : []).toEqual([
      { field: "sucursal", title: "sucursal", temporal: false },
      { field: "total", title: "Suma de ventas", temporal: false },
    ]);
    expect(stageLine(user)).toBe(t.stage.chart.doneUser(0));
    expect(chart?.layers.map((l) => [l.layer, l.state])).toEqual([
      ["encoding", "accepted"],
      ["caption", "accepted"],
      ["transform", "rejected"],
    ]);
  });
});

describe("plain words", () => {
  it("for calculations, proposals and keys", () => {
    expect(
      describeTransform([
        { timeUnit: "yearmonth", field: "fecha", as: "mes" },
        { aggregate: [{ op: "mean", field: "precio", as: "p" }], groupby: ["mes", "zona"] },
      ]),
    ).toBe(
      "agrupa las fechas de «fecha» por mes; después, el promedio de «precio» por «mes» y «zona»",
    );
    expect(describeTransform([])).toBe(t.chart.calc.none);
    expect(
      patchText({
        target: { block: "c1", layer: "encoding", path: "encoding.y.title" },
        text: '"Total"',
      }),
    ).toEqual({ action: t.chart.patch.axisTitle("eje vertical"), proposed: "Total" });
    expect(
      patchText({
        target: { block: "c1", layer: "encoding", path: "encoding.color.scale" },
        text: "{}",
      }),
    ).toEqual({ action: t.chart.patch.channel("los colores"), proposed: null });
    expect(keyLabel("2025-03-31")).toBe("31 de marzo de 2025");
    expect(keyLabel("Córdoba")).toBe("Córdoba");
  });
});
