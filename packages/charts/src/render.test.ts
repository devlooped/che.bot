import { chartSpec, type Row } from "@chebot/protocol";
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

test("a chart draws the values of its rows, and an unsettled row as the range of its values", async () => {
  const row = (key: string, value: number, extra: Partial<Row> = {}): Row => ({
    key,
    values: { value },
    source: "src1",
    quote: "",
    support: ["grok", "claude"],
    status: "agreed",
    alternatives: [],
    ...extra,
  });
  const spec = chartSpec({
    kind: "chart",
    id: "c1",
    brief: { question: "q", measures: ["Inflación (%)"], dimensions: ["Mes"] },
    data: {
      rows: [
        row("2026-01", 2.2),
        row("2026-02", 3.5, {
          status: "unsettled",
          alternatives: [
            { values: { value: 3.7 }, source: "src2", quote: "", support: ["openai"] },
          ],
        }),
      ],
    },
    transform: [],
    mark: "bar",
    encoding: {
      x: { field: "key", type: "nominal" },
      y: { field: "value", type: "quantitative" },
    },
    title: "Inflación",
    caption: "",
  });
  const r = await renderSpec(spec);
  expect(r.marks).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ key: "2026-01", value: 2.2 }),
      expect.objectContaining({ key: "2026-02", low: 3.5, high: 3.7 }),
    ]),
  );
});
