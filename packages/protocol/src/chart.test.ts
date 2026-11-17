import fc from "fast-check";
import { describe, expect, test } from "vitest";
import {
  chartSpec,
  checkPatch,
  layersFromSpec,
  parseNumber,
  patchChart,
  quoteStates,
  readModelNumber,
  sameValue,
  stripTheme,
} from "./chart.ts";
import { type RowSettlement, settleRows } from "./chart-run.ts";
import type { Chart, Row, Snapshot } from "./model.ts";
import { apply, type Change, lockKey } from "./threads.ts";

const webRow = (key: string, value: number, extra: Partial<Row> = {}): Row => ({
  key,
  values: { value },
  source: "src1",
  quote: `${value}`,
  support: ["grok", "claude"],
  status: "agreed",
  alternatives: [],
  ...extra,
});

const web = (rows: Row[] = [webRow("2026-01", 2.2), webRow("2026-02", 2.4)]): Chart => ({
  kind: "chart",
  id: "c1",
  brief: { question: "q", measures: ["Inflación (%)"], dimensions: ["Mes"] },
  data: { rows },
  transform: [],
  encoding: {
    x: { field: "key", type: "temporal" },
    y: { field: "value", type: "quantitative" },
  },
  mark: "line",
  title: "Inflación",
  caption: "Según el INDEC.",
});

describe("numbers of the web", () => {
  test("numbers as people write them", () => {
    expect(parseNumber("2,7")).toBe(2.7);
    expect(parseNumber("1.234.567")).toBe(1234567);
    expect(parseNumber("1,234,567")).toBe(1234567);
    expect(parseNumber("1 234 567")).toBe(1234567);
    expect(parseNumber("-3,5 %")).toBe(-3.5);
    expect(parseNumber("US$ 12")).toBe(12);
    expect(parseNumber("12 de mayo")).toBeNull();
    expect(readModelNumber("3121707")).toBe(3121707);
    expect(readModelNumber("2.7")).toBe(2.7);
    expect(readModelNumber("n/d")).toBeNull();
  });

  test("the same value: equal, or equal at the coarser precision when both have decimals", () => {
    expect(sameValue(2.4, 2.4)).toBe(true);
    expect(sameValue(2.7, 2.72)).toBe(true);
    expect(sameValue(3, 3.4)).toBe(false);
    expect(sameValue(3121707, 3120612)).toBe(false);
  });

  test("a quote states a value in the ways pages write numbers", () => {
    expect(quoteStates(2.7, "La inflación de marzo fue de 2,7% según el INDEC")).toBe(true);
    expect(quoteStates(3121707, "la Ciudad tiene 3.121.707 habitantes")).toBe(true);
    expect(quoteStates(3121707, "unos 3,1 millones de personas")).toBe(true);
    expect(quoteStates(3121707, "unos 2,9 millones de personas")).toBe(false);
    expect(quoteStates(2.7, "subió 3,7% en abril")).toBe(false);
  });
});

describe("patches on the layers of a chart", () => {
  test("lock keys: one per layer of the chart; rows are locked by their dispute", () => {
    expect(lockKey("c1", "patch", "grok", "encoding")).toBe("c1/encoding");
    expect(lockKey("c1", "patch", "claude", "encoding")).toBe("c1/encoding");
    expect(lockKey("c1", "patch", "grok", "caption")).toBe("c1/caption");
  });

  test("allowed paths per layer", () => {
    const c = web();
    expect(checkPatch(c, { layer: "title", path: "", value: "Inflación mensual" })).toMatchObject({
      ok: true,
    });
    expect(checkPatch(c, { layer: "title", path: "x", value: "a" })).toMatchObject({
      why: "unknown_path",
    });
    expect(checkPatch(c, { layer: "encoding", path: "mark", value: '"bar"' })).toMatchObject({
      ok: true,
      value: "bar",
    });
    expect(checkPatch(c, { layer: "encoding", path: "mark", value: '"pie"' })).toMatchObject({
      why: "invalid_value",
    });
    expect(
      checkPatch(c, { layer: "encoding", path: "encoding.y.title", value: '"%"' }),
    ).toMatchObject({ ok: true });
    expect(
      checkPatch(c, { layer: "encoding", path: "encoding.href", value: '{"field":"key"}' }),
    ).toMatchObject({
      why: "unknown_path",
    });
    expect(
      checkPatch(c, { layer: "transform", path: "0", value: '{"filter":"datum.value > 0"}' }),
    ).toMatchObject({
      ok: true,
    });
    expect(
      checkPatch(c, { layer: "transform", path: "3", value: '{"filter":"datum.value > 0"}' }),
    ).toMatchObject({
      why: "unknown_path",
    });
    expect(
      checkPatch(c, { layer: "encoding", path: "encoding.y.title", value: "null" }),
    ).toMatchObject({
      why: "no_change",
    });
  });

  test("the theme is stripped; a patch of nothing but the theme is dropped", () => {
    const c = web();
    expect(
      checkPatch(c, { layer: "encoding", path: "encoding.y.scale.scheme", value: '"reds"' }),
    ).toMatchObject({
      why: "theme_only",
    });
    expect(
      checkPatch(c, { layer: "encoding", path: "encoding.color.value", value: '"red"' }),
    ).toMatchObject({
      why: "theme_only",
    });
    const mixed = checkPatch(c, {
      layer: "encoding",
      path: "encoding.y",
      value:
        '{"field":"value","type":"quantitative","title":"%","axis":{"labelFont":"Comic Sans","labelColor":"red"},"scale":{"range":["red"]}}',
    });
    expect(mixed).toEqual({
      ok: true,
      value: { field: "value", type: "quantitative", title: "%" },
      stripped: [
        "encoding.y.axis.labelFont",
        "encoding.y.axis.labelColor",
        "encoding.y.scale.range",
      ],
    });
    expect(stripTheme({ config: { font: "x" }, mark: "bar" }, []).value).toEqual({ mark: "bar" });
    // a color channel that encodes data stays
    expect(
      checkPatch(c, { layer: "encoding", path: "encoding.color", value: '{"field":"key"}' }),
    ).toMatchObject({
      ok: true,
    });
  });

  test("a data patch is no layer patch (the sources settle it), and anything that carries values is refused", () => {
    const c = web();
    expect(checkPatch(c, { layer: "data", path: "2026-01", value: "1000" })).toMatchObject({
      why: "unknown_path",
    });
    expect(
      checkPatch(c, { layer: "encoding", path: "encoding.y", value: '{"datum":999}' }),
    ).toMatchObject({
      why: "inline_data",
    });
    expect(
      checkPatch(c, {
        layer: "transform",
        path: "",
        value:
          '[{"lookup":"region","from":{"data":{"values":[{"region":"Norte"}]},"key":"region"}}]',
      }),
    ).toMatchObject({ why: "inline_data" });
    expect(
      checkPatch(c, { layer: "transform", path: "", value: '[{"calculate":"1000","as":"x"}]' }),
    ).toMatchObject({
      why: "transform_not_allowed",
    });
    expect(
      checkPatch(c, {
        layer: "transform",
        path: "",
        value: '[{"calculate":"datum.value * 2","as":"value"}]',
      }),
    ).toMatchObject({ why: "transform_not_allowed" });
    expect(
      checkPatch(c, {
        layer: "transform",
        path: "",
        value: '[{"calculate":"datum.value * 2","as":"doble"}]',
      }),
    ).toMatchObject({ ok: true });
    expect(
      checkPatch(c, {
        layer: "transform",
        path: "",
        value: '[{"impute":"value","key":"key","value":0}]',
      }),
    ).toMatchObject({
      why: "transform_not_allowed",
    });
  });

  test("a spec that carries data is refused; its theme is stripped", () => {
    expect(
      layersFromSpec('{"data":{"values":[{"a":1}]},"mark":"bar","encoding":{}}'),
    ).toMatchObject({
      ok: false,
      why: "inline_data",
    });
    expect(
      layersFromSpec(
        '{"mark":{"type":"bar","color":"red"},"encoding":{"x":{"field":"key"},"color":{"value":"red"}},"config":{"font":"x"}}',
      ),
    ).toEqual({
      ok: true,
      mark: "bar",
      encoding: { x: { field: "key" } },
      transform: [],
      stripped: ["encoding.color.value"],
    });
  });
});

describe("the spec of a chart", () => {
  test("data, layers and the fixed theme; an unsettled row is a range, not a point", () => {
    const c = web([
      webRow("2026-01", 2.2),
      webRow("2026-02", 3.5, {
        status: "unsettled",
        alternatives: [
          { values: { value: 3.7 }, source: "src2", quote: "3,7", support: ["openai"] },
        ],
      }),
    ]);
    const spec = chartSpec(c);
    expect((spec.data as { values: unknown[] }).values).toEqual([
      { key: "2026-01", value: 2.2, low: null, high: null, source: "src1" },
      { key: "2026-02", value: null, low: 3.5, high: 3.7, source: "src1" },
    ]);
    expect(spec.layer).toEqual([
      { mark: "line", encoding: c.encoding },
      {
        mark: { type: "rule", strokeWidth: 3 },
        encoding: {
          x: { field: "key", type: "temporal" },
          y: { field: "low", type: "quantitative" },
          y2: { field: "high" },
        },
      },
    ]);
    expect(spec.config).toMatchObject({ font: expect.stringContaining("Instrument Sans") });
  });
});

describe("apply on a chart is one deterministic pass", () => {
  const snapshot: Snapshot = {
    version: 3,
    order: ["c1"],
    blocks: {
      c1: web([
        webRow("2026-01", 2.2),
        webRow("2026-02", 2.4, { status: "disputed" }),
        webRow("2026-03", 3, { status: "single" }),
      ]),
    },
  };
  const patch = (thread: string, layer: Change["layer"], path: string, value: unknown): Change => ({
    thread,
    op: "patch",
    block: "c1",
    layer,
    path,
    author: "grok",
    text: JSON.stringify(value),
    sources: [],
    support: ["grok", "claude", "openai"],
  });
  const changes = [
    patch("t1", "encoding", "encoding.y.title", "Inflación (%)"),
    patch("t2", "caption", "", "Nuevo texto."),
    patch("t3", "transform", "", [{ filter: "datum.value > 0" }]),
    patch("t4", "title", "", "Título"),
  ];
  const value = (v: number, source: string) => ({
    id: "v1",
    value: v,
    source,
    quote: "",
    support: [],
    stated: true,
  });
  const settlements: RowSettlement[] = [
    { block: "c1", row: "2026-02", state: "held", winner: value(2.5, "src9"), values: [] },
    { block: "c1", row: "2026-03", state: "unverified", winner: null, values: [value(3, "src1")] },
  ];

  test("patches by layer and path, rows settled by key", () => {
    const out = apply(snapshot, changes, 1, settlements).snapshot;
    const c = out.blocks.c1 as Chart;
    expect(out.version).toBe(4);
    expect((c.encoding.y as { title: string }).title).toBe("Inflación (%)");
    expect([c.caption, c.title, c.transform]).toEqual([
      "Nuevo texto.",
      "Título",
      [{ filter: "datum.value > 0" }],
    ]);
    expect(c.data.rows.map((r) => [r.key, r.status, r.values.value, r.source])).toEqual([
      ["2026-01", "agreed", 2.2, "src1"],
      ["2026-02", "held", 2.5, "src9"],
      ["2026-03", "unverified", 3, "src1"],
    ]);
    // the input is never changed
    expect((snapshot.blocks.c1 as Chart).caption).toBe("Según el INDEC.");
  });

  test("the same changes give the same chart whatever their order", () => {
    const expected = JSON.stringify(apply(snapshot, changes, 1, settlements).snapshot);
    fc.assert(
      fc.property(
        fc.shuffledSubarray(changes, { minLength: 4 }),
        fc.shuffledSubarray(settlements, { minLength: 2 }),
        (cs, ss) => {
          expect(JSON.stringify(apply(snapshot, cs, 1, ss).snapshot)).toBe(expected);
        },
      ),
    );
  });

  test("null at an index of the transform removes that step", () => {
    const c = {
      ...web(),
      transform: [{ filter: "datum.value > 0" }, { filter: "datum.value < 9" }],
    };
    const checked = checkPatch(c, { layer: "transform", path: "0", value: "null" });
    expect(checked).toEqual({ ok: true, value: null, stripped: [] });
    expect(patchChart(c, "transform", "0", null).transform).toEqual([
      { filter: "datum.value < 9" },
    ]);
    expect(checkPatch(c, { layer: "transform", path: "2", value: "null" })).toMatchObject({
      why: "unknown_path",
    });
  });

  test("a value of null removes the path", () => {
    const c = patchChart(web(), "encoding", "encoding.y", null);
    expect(c.encoding).toEqual({ x: { field: "key", type: "temporal" } });
    expect(settleRows(c, [])).toBe(c);
  });
});
