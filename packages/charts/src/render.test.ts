import { chartSpec, parseCsv } from "@chebot/protocol";
import { expect, test } from "vitest";
import { renderSpec, renderSpecs } from "./render.ts";

test("renders a Vega-Lite spec to SVG in interpreter mode", async () => {
  const r = await renderSpec({
    data: {
      values: [
        { a: "x", b: 3 },
        { a: "y", b: 5 },
      ],
    },
    transform: [{ calculate: "datum.b * 2", as: "c" }, { filter: "datum.c > 7" }],
    mark: "bar",
    encoding: { x: { field: "a", type: "nominal" }, y: { field: "c", type: "quantitative" } },
  });
  expect(r.svg).toMatch(/^<svg/);
  expect(r.marks).toEqual([expect.objectContaining({ a: "y", b: 5, c: 10 })]);
});

test("a spec that does not compile, does not run or draws nothing fails with its error", async () => {
  const out = await renderSpecs({
    specs: [
      { id: "mark", spec: { data: { values: [{ a: 1 }] }, mark: "pie", encoding: {} } },
      {
        id: "expr",
        spec: {
          data: { values: [{ a: 1 }] },
          transform: [{ filter: "datum.a >" }],
          mark: "point",
          encoding: {},
        },
      },
      {
        id: "empty",
        spec: {
          data: { values: [{ a: 1 }] },
          transform: [{ filter: "datum.nope > 0" }],
          mark: "point",
          encoding: { x: { field: "a", type: "quantitative" } },
        },
      },
      {
        id: "url",
        spec: { data: { url: "https://example.org/data.json" }, mark: "point", encoding: {} },
      },
      {
        id: "ok",
        spec: {
          data: { values: [{ a: 1 }] },
          mark: "point",
          encoding: { x: { field: "a", type: "quantitative" } },
        },
      },
    ],
  });
  expect(out.results.map((r) => [r.id, r.status])).toEqual([
    ["mark", "failed"],
    ["expr", "failed"],
    ["empty", "failed"],
    ["url", "failed"],
    ["ok", "ok"],
  ]);
  expect(out.results[2]?.error).toBe("The chart draws nothing.");
});

test("user data: every drawn number is the orchestrator's computation over the uploaded rows", async () => {
  const csv =
    'region;mes;ventas\nNorte;2026-01;100\nNorte;2026-02;150\nSur;2026-01;80\nSur;2026-02;"95,5"\nOeste;2026-01;40\nOeste;2026-02;';
  const data = parseCsv(csv);
  const spec = chartSpec({
    kind: "chart",
    id: "c1",
    brief: { question: "q", measures: ["ventas"], dimensions: ["region"] },
    data: {
      origin: "user",
      columns: data.columns,
      rows: data.rows.map((values, i) => ({
        key: `r${i + 1}`,
        values,
        source: "upload",
        quote: "",
        support: [],
        status: "upload",
        alternatives: [],
      })),
    },
    transform: [{ aggregate: [{ op: "sum", field: "ventas", as: "total" }], groupby: ["region"] }],
    mark: "bar",
    encoding: {
      x: { field: "region", type: "nominal" },
      y: { field: "total", type: "quantitative" },
    },
    title: "Ventas",
    caption: "",
  });
  const r = await renderSpec(spec);
  // an independent computation, straight from the CSV text
  const expected = new Map<string, number>();
  for (const line of csv.split("\n").slice(1)) {
    const [region, , raw] = line.split(";") as [string, string, string];
    const v = raw === "" ? 0 : Number(raw.replace(/"/g, "").replace(",", "."));
    expected.set(region, (expected.get(region) ?? 0) + v);
  }
  expect(Object.fromEntries(r.marks.map((m) => [m.region, m.total]))).toEqual(
    Object.fromEntries(expected),
  );
});
