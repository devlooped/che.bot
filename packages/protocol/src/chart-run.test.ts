import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { selectAnswer, selectChart } from "./answer.ts";
import { chartSpec, transformFields } from "./chart.ts";
import {
  CAPTION,
  SALES,
  SUM_BY_REGION,
  userChart,
  WEB_QUESTION,
  webChart,
} from "./chart-fixtures.ts";
import { holdsUp } from "./chart-run.ts";
import { drive, eventsOf, ok, type Responder } from "./fixtures.ts";
import type { Chart, ModelId } from "./model.ts";
import { templateMoments } from "./moments.ts";
import { replay } from "./replay.ts";
import { clone, seededShuffle } from "./util.ts";

const webRun = () =>
  drive({ mode: "thorough", question: WEB_QUESTION, chart: { dataset: null } }, webChart);
const chartOf = (s: { blocks: Record<string, unknown> }) => s.blocks.c1 as Chart;
const answerOf = (state: ReturnType<typeof webRun>["state"], version?: number) =>
  selectChart(
    { ...state, disputes: state.chart?.disputes ?? {}, renders: state.chart?.renders ?? [] },
    version,
  );

describe("a scripted chart run on web data", () => {
  const run = webRun();
  const { state, log } = run;
  const keys = run.steps.flatMap((s) => s.calls.map((c) => c.key));

  test("goes through every stage: briefs, merge, spec, render gate, rounds; no editor", () => {
    expect(state.status).toBe("completed");
    expect(eventsOf(log, "stage.changed").map((e) => e.stage)).toEqual([
      "drafting",
      "merging",
      "round1",
      "round2",
      "done",
    ]);
    expect(run.steps.map((s) => s.phase)).toEqual([
      "draft",
      "merge",
      "spec",
      "seed",
      "moments",
      "round",
      "gate",
      "render",
      "moments",
      "round",
      "render",
      "moments",
      "settle",
      "finish",
    ]);
    expect(keys).toEqual(
      expect.arrayContaining([
        "brief:0:grok",
        "chart-merge:0",
        "spec:0:grok",
        "render:seed",
        "round:1:gemini",
        "render:gate:1",
        "render:v2",
        "round:2:claude",
        "render:v3",
      ]),
    );
    expect(new Set(keys).size).toBe(keys.length);
    // the same bound as a prose run: 4 briefs, the spec and at most 12 round calls to the panel
    const panel = run.steps.flatMap((s) =>
      s.calls.filter((c) => c.seat !== "utility" && c.seat !== "renderer"),
    );
    expect(panel).toHaveLength(13);
    expect(keys.some((k) => k.startsWith("edit"))).toBe(false);
  });

  test("briefs search; a row without a citation found in that call, or without a number, is dropped", () => {
    expect(run.steps[0]?.calls.every((c) => c.search?.maxResults === 10)).toBe(true);
    const briefs = eventsOf(log, "brief.completed");
    expect(briefs.find((b) => b.model === "claude")?.brief.dropped).toEqual([
      { key: "2026-06", why: "no_citation" },
    ]);
    expect(briefs.find((b) => b.model === "gemini")?.brief.dropped).toEqual([
      { key: "2026-07", why: "not_a_number" },
    ]);
    const v1 = chartOf(state.snapshots[0] as never);
    expect(v1.data.rows.map((r) => r.key)).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
    ]);
    // every row's source is a search result of the run
    const urls = new Set(state.sources.map((s) => s.id));
    for (const r of v1.data.rows)
      for (const v of [r, ...r.alternatives]) expect(urls.has(v.source)).toBe(true);
  });

  test("the merge: same value from several models is support, different values are kept with their sources", () => {
    const v1 = chartOf(state.snapshots[0] as never);
    const row = (k: string) => v1.data.rows.find((r) => r.key === k);
    // gemini wrote "Enero 2026": the utility model aligned the label, code compared the values
    expect(row("2026-01")).toMatchObject({
      status: "agreed",
      support: ["grok", "claude", "openai", "gemini"],
    });
    expect(row("2026-02")).toMatchObject({
      status: "agreed",
      support: ["grok", "claude", "openai"],
      values: { value: 2.4 },
    });
    expect(row("2026-03")).toMatchObject({
      status: "disputed",
      values: { value: 3.1 },
      support: ["grok", "openai"],
      alternatives: [{ values: { value: 3 }, support: ["claude"] }],
    });
    expect(row("2026-04")).toMatchObject({ status: "single", support: ["gemini"] });
    expect(
      eventsOf(log, "dispute.opened").map((e) => [
        e.dispute.id,
        e.dispute.row,
        e.dispute.openedRound,
      ]),
    ).toEqual([
      ["d1", "2026-03", 0],
      ["d2", "2026-04", 0],
      ["d3", "2026-05", 0],
      ["d4", "2026-02", 1],
    ]);
  });

  test("one model writes the spec; the theme is stripped from it; version 1 is its render", () => {
    expect(eventsOf(log, "chart.written")).toEqual([
      expect.objectContaining({
        writer: "grok",
        used: "writer",
        stripped: ["encoding.y.scale.scheme", "encoding.color.value"],
      }),
    ]);
    const v1 = chartOf(state.snapshots[0] as never);
    expect(v1.mark).toBe("line");
    expect(v1.encoding).toEqual({
      x: { field: "key", type: "temporal", title: "Mes" },
      y: { field: "value", type: "quantitative", title: "Inflación (%)" },
    });
    expect(state.chart?.renders.map((r) => [r.version, r.call, r.result, r.ok])).toEqual([
      [1, "render:seed", "writer", true],
      [2, "render:v2", "v2", true],
      [3, "render:v3", "v3", true],
    ]);
  });

  test("a patch that does not render never reaches a vote; a patch of the theme is dropped", () => {
    expect(state.chart?.dropped.map((d) => [d.model, d.layer, d.why])).toEqual([
      ["claude", "encoding", "theme_only"],
      ["claude", "transform", "render_failed"],
    ]);
    const opened = eventsOf(log, "suggestion.opened").map((e) => e.suggestion);
    expect(opened.map((s) => [s.author, s.target.layer])).toEqual([
      ["grok", "encoding"],
      ["grok", "caption"],
    ]);
    expect(opened.some((s) => s.text.includes("nope") || s.text.includes("reds"))).toBe(false);
    // the gate rendered only the patches that are drawn (not the caption)
    const gate = run.steps.find((s) => s.phase === "gate")?.calls[0];
    expect(gate?.render?.specs.map((s) => s.id)).toEqual(["p0", "p2"]);
    expect(eventsOf(log, "patch.dropped").map((e) => e.why)).toEqual([
      "theme_only",
      "render_failed",
    ]);
  });

  test("layers are settled by votes: one thread per layer, duplicates merged", () => {
    expect(Object.values(state.threads).map((t) => [t.lockKey, t.state])).toEqual([
      ["c1/encoding", "accepted"],
      ["c1/caption", "accepted"],
    ]);
    expect(state.suggestions.s2?.coAuthors).toEqual(["openai"]);
    const last = chartOf(state.snapshots.at(-1) as never);
    expect(last.caption).toBe(CAPTION);
    expect((last.encoding.y as { title: string }).title).toBe("Inflación mensual (%)");
  });

  test("rows are settled by source, never by a vote on the number", () => {
    const disputes = state.chart?.disputes ?? {};
    expect(Object.values(disputes).map((d) => [d.row, d.state, d.winner])).toEqual([
      ["2026-03", "held", "v1"],
      ["2026-04", "held", "v1"],
      ["2026-05", "unsettled", null],
      ["2026-02", "held", "v1"],
    ]);
    const last = chartOf(state.snapshots.at(-1) as never);
    expect(last.data.rows.map((r) => [r.key, r.status, r.values.value])).toEqual([
      ["2026-01", "agreed", 2.2],
      ["2026-02", "held", 2.4],
      ["2026-03", "held", 3.1],
      ["2026-04", "held", 2.8],
      ["2026-05", "unsettled", 3.5],
    ]);
    // two values whose sources both hold up: both kept with their sources, drawn as a range
    const may = last.data.rows.find((r) => r.key === "2026-05");
    expect(may?.alternatives.map((a) => [a.values.value, a.support])).toEqual([[3.7, ["claude"]]]);
    const values = (chartSpec(last).data as { values: Record<string, unknown>[] }).values;
    expect(values.find((v) => v.key === "2026-05")).toMatchObject({
      value: null,
      low: 3.5,
      high: 3.7,
    });
  });

  test("a value supported by more models does not win when its source does not hold up", () => {
    // d1 again, with the checks reversed: three models give 3.1, but its quote does not state it
    const d1 = state.chart?.disputes.d1 ? clone(state.chart.disputes.d1) : undefined;
    if (!d1) throw new Error("no d1");
    const [v1, v2] = d1.values as [(typeof d1.values)[number], (typeof d1.values)[number]];
    v1.stated = false;
    v1.support = ["grok", "openai", "gemini"];
    d1.checks = {
      v1: { claude: "holds" },
      v2: { grok: "holds", openai: "holds", gemini: "fails" },
    };
    expect(holdsUp(d1, v1)).toBe(false);
    expect(holdsUp(d1, v2)).toBe(true);
  });

  test("the chart answer: the data with its sources, the disputes, the render of the version", () => {
    const answer = answerOf(state);
    expect(answer).toMatchObject({
      version: 3,
      final: true,
      origin: "web",
      title: "Inflación mensual de 2026",
    });
    expect(answer?.rows.every((r) => r.source?.url.startsWith("https://"))).toBe(true);
    expect(
      answer?.disputed.map((r) => [r.key, r.status, r.alternatives.map((a) => a.source?.url)]),
    ).toEqual([["2026-05", "unsettled", ["https://otra.example/mayo"]]]);
    expect(answer?.rows.find((r) => r.key === "2026-03")?.dispute).toMatchObject({
      state: "held",
      winner: "v1",
      values: [
        { id: "v1", value: 3.1, holds: 2, checkers: 2 },
        { id: "v2", value: 3, holds: 0, checkers: 3 },
      ],
    });
    expect(answer?.render).toMatchObject({ version: 3, call: "render:v3" });
    expect(answerOf(state, 1)?.rows.find((r) => r.key === "2026-03")?.status).toBe("disputed");
    expect(answer?.spec.data).toBeDefined();
    // the prose selector has no paragraphs to show
    expect(selectAnswer(state)?.paragraphs).toEqual([]);
  });

  test("the template moments speak of data and sources", () => {
    const of = (types: string[]) => log.filter((e) => types.includes(e.type));
    expect(templateMoments(of(["document.seeded", "dispute.settled"]))).toEqual([
      "Juntamos los datos en un gráfico: 5 datos, y 3 quedan para verificar con las fuentes.",
      "3 datos quedaron confirmados por su fuente; en 1 las fuentes no coinciden y se muestra el rango.",
    ]);
    expect(templateMoments(of(["brief.completed"]))).toEqual([
      "Los cuatro ya juntaron sus datos, cada uno por su cuenta.",
    ]);
  });

  test("replaying the events alone rebuilds every chart version, the disputes and the renders", () => {
    const view = replay(log);
    expect(view.snapshots).toEqual(state.snapshots);
    expect(view.versions.map((v) => [v.version, v.cause])).toEqual([
      [1, "merge"],
      [2, "round"],
      [3, "round"],
    ]);
    expect(view.disputes).toEqual(state.chart?.disputes);
    expect(view.renders).toEqual(state.chart?.renders);
    expect(view.droppedPatches).toEqual(state.chart?.dropped);
    expect(view.briefs).toEqual(state.chart?.briefs);
    expect(view.chart).toEqual({ origin: "web", dataset: null });
    expect(view.written).toMatchObject({ writer: "grok", used: "writer" });
    for (const s of state.snapshots)
      expect(selectChart(view, s.version)).toEqual(answerOf(state, s.version));
  });

  test("the same results in any order give the same chart versions", () => {
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        const shuffled = drive(
          { mode: "thorough", question: WEB_QUESTION, chart: { dataset: null } },
          webChart,
          {
            permute: (results, i) => seededShuffle(results, `${seed}|${i}`),
          },
        );
        expect(shuffled.state.snapshots).toEqual(state.snapshots);
        expect(shuffled.state.chart?.disputes).toEqual(state.chart?.disputes);
      }),
      { numRuns: 25 },
    );
  });
});

describe("a scripted chart run on uploaded data", () => {
  const run = drive(
    { mode: "thorough", question: "¿Cuánto vendió cada región?", chart: { dataset: SALES } },
    userChart,
  );
  const { state, log } = run;

  test("briefs see the columns and statistics, never the rows; no search; no merge call", () => {
    const brief = run.steps[0]?.calls[0];
    expect(brief?.kind).toBe("brief_user");
    expect(brief?.search).toBeUndefined();
    expect(brief?.prompt).toContain(
      "ventas (number): 5 values, 1 empty; min 40, max 150, mean 93.1, sum 465.5",
    );
    expect(brief?.prompt).not.toContain("Norte;");
    expect(run.steps[1]).toMatchObject({ phase: "merge", calls: [] });
    expect(state.status).toBe("completed");
  });

  test("the merge of an upload reads as the user's own data", () => {
    expect(
      templateMoments(
        log.filter((e) => e.type === "document.seeded"),
        { chart: true },
      ),
    ).toEqual(["Armamos el gráfico con los datos que subiste."]);
  });

  test("the briefs agree by code: dimension, measures, the transform most chose", () => {
    const v1 = chartOf(state.snapshots[0] as never);
    expect(v1.brief).toEqual({
      question: "¿Cuánto vendió cada región?",
      measures: ["ventas"],
      dimensions: ["region"],
    });
    expect(v1.transform).toEqual(JSON.parse(SUM_BY_REGION));
    // gemini's transform carried data (a lookup): it is no proposal at all
    expect(state.chart?.briefs.find((b) => b.model === "gemini")?.transform).toBeNull();
  });

  test("no value of the chart comes from a model: a spec, a patch or a data patch that carries values is refused", () => {
    expect(eventsOf(log, "chart.written")).toEqual([
      expect.objectContaining({ used: "plain", why: "inline_data: The spec carries data." }),
    ]);
    expect(state.chart?.dropped.map((d) => [d.model, d.layer, d.why])).toEqual([
      ["grok", "data", "user_data"],
      ["claude", "encoding", "inline_data"],
    ]);
    for (const s of state.snapshots) {
      const c = chartOf(s);
      expect(c.data.rows.map((r) => r.values)).toEqual(SALES.rows);
      expect(c.data.rows.every((r) => r.source === "upload" && r.status === "upload")).toBe(true);
      expect((chartSpec(c).data as { values: unknown[] }).values).toEqual(SALES.rows);
    }
    const last = chartOf(state.snapshots.at(-1) as never);
    expect(last.encoding.y).toEqual({
      field: "total",
      type: "quantitative",
      title: "Ventas totales",
    });
    expect(JSON.stringify(last)).not.toContain("999");
    expect(JSON.stringify(last)).not.toContain("1000");
  });
});

describe("the chart run's stopping rules", () => {
  test("quick mode stops at the seeded chart; fewer than 3 briefs skip the rounds", () => {
    const quick = drive(
      { mode: "quick", question: WEB_QUESTION, chart: { dataset: null } },
      webChart,
    );
    expect(quick.state.status).toBe("completed");
    // nothing was checked: the conflict of May is drawn as a range in the version that closes the run
    expect(quick.state.snapshots).toHaveLength(2);
    expect(Object.values(quick.state.chart?.disputes ?? {}).map((d) => d.state)).toEqual([
      "unchecked",
      "unchecked",
      "unchecked",
    ]);
    expect(chartOf(quick.state.snapshots[1] as never).data.rows.map((r) => r.status)).toEqual([
      "agreed",
      "agreed",
      "unsettled",
      "single",
      "unsettled",
    ]);
    expect(quick.state.chart?.renders.map((r) => r.version)).toEqual([1, 2]);
    const two: Responder = (call, state) =>
      call.kind === "brief_web" && (call.seat === "grok" || call.seat === "claude")
        ? null
        : webChart(call, state);
    const few = drive({ mode: "thorough", question: WEB_QUESTION, chart: { dataset: null } }, two);
    expect(few.state.flags.fewDrafts).toBe(true);
    expect(few.steps.some((s) => s.phase === "round")).toBe(false);
  });

  test("no brief with data fails the run", () => {
    const empty: Responder = (call, state) =>
      call.kind === "brief_web"
        ? ok(call, { question: "q", dimension: "d", measure: "m", mark: "bar", rows: [] })
        : webChart(call, state);
    const run = drive(
      { mode: "thorough", question: WEB_QUESTION, chart: { dataset: null } },
      empty,
    );
    expect(run.state).toMatchObject({ status: "failed", failure: "no_drafts" });
  });

  test("a writer that fails gives the plain chart of code; a version that does not render is undone", () => {
    const broken: Responder = (call, state) => {
      if (call.kind === "chart_spec") return null;
      if (call.kind === "render" && call.key === "render:v2")
        return ok(call, {
          results: [{ id: "v2", status: "failed", error: "boom", svg: "", marks: "[]" }],
        });
      return webChart(call, state);
    };
    const run = drive(
      { mode: "thorough", question: WEB_QUESTION, chart: { dataset: null } },
      broken,
    );
    expect(eventsOf(run.log, "chart.written")[0]).toMatchObject({ used: "plain", why: "no spec" });
    expect(run.state.chart?.renders.slice(0, 3).map((r) => [r.version, r.ok])).toEqual([
      [1, true],
      [2, false],
      [3, true],
    ]);
    const v3 = run.state.snapshots.find((s) => s.version === 3);
    expect(eventsOf(run.log, "snapshot.created").find((e) => e.snapshot.version === 3)?.cause).toBe(
      "render",
    );
    // the drawn layers come back from version 1, the settled rows stay
    expect(chartOf(v3 as never).encoding).toEqual(
      chartOf(run.state.snapshots[0] as never).encoding,
    );
    expect(chartOf(v3 as never).data).toEqual(chartOf(run.state.snapshots[1] as never).data);
    expect(run.state.status).toBe("completed");
  });

  test("the deadline does not cut a render: the last version is rendered after it", () => {
    const run = drive(
      { mode: "thorough", question: WEB_QUESTION, chart: { dataset: null } },
      webChart,
      { tick: (s) => (s.phase === "round" && s.stage === "round2" ? 300_000 : 1000) },
    );
    const lastRender = run.steps.filter((s) => s.phase === "render").at(-1)?.calls[0];
    expect(lastRender?.timeoutMs).toBe(run.state.config.callTimeoutMs.render);
    const models = (m: ModelId) => run.state.calls[`round:2:${m}`];
    expect(models("grok")).toBeDefined();
    expect(run.state.chart?.renders.at(-1)?.version).toBe(run.state.snapshots.at(-1)?.version);
  });
});

describe("found in the live runs", () => {
  // The four briefs of the live CSV run: every measure is a field of the brief's own transform, and
  // three of the four transforms have the same shape with other field names.
  const briefs: Record<ModelId, unknown> = {
    grok: {
      dimension: "mes",
      measures: ["facturacion"],
      transform:
        '[{"calculate":"datum.ventas * 2","as":"facturacion"},{"pivot":"region","value":"facturacion","groupby":["mes"]}]',
    },
    claude: {
      dimension: "mes",
      measures: ["total"],
      transform:
        '[{"calculate":"datum.ventas * 2","as":"fila"},{"aggregate":[{"op":"sum","field":"fila","as":"total"}],"groupby":["mes","region"]}]',
    },
    openai: {
      dimension: "mes",
      measures: ["facturacion_total"],
      transform:
        '[{"calculate":"datum.ventas * 2","as":"facturacion"},{"aggregate":[{"op":"sum","field":"facturacion","as":"facturacion_total"}],"groupby":["mes","region"]}]',
    },
    gemini: { dimension: "mes", measures: ["inventada"], transform: "[]" },
  };
  const live: Responder = (call, state) =>
    call.kind === "brief_user"
      ? ok(call, {
          question: "¿Cuánto facturó cada región por mes?",
          mark: "bar",
          ...(briefs[call.seat as ModelId] as object),
        })
      : userChart(call, state);

  test("user data: a brief may measure a field of its transform; the merge keeps the brief most like the others, whole", () => {
    const run = drive({ mode: "quick", question: "q", chart: { dataset: SALES } }, live);
    expect(run.state.chart?.briefs.map((b) => b.measures)).toEqual([
      ["facturacion"],
      ["total"],
      ["facturacion_total"],
      [],
    ]);
    const v1 = chartOf(run.state.snapshots[0] as never);
    // claude: the dimension all chose, the transform shape (calculate > aggregate) three chose, first in model order
    expect(v1.brief).toMatchObject({ dimensions: ["mes"], measures: ["total"] });
    expect(v1.transform).toEqual(JSON.parse((briefs.claude as { transform: string }).transform));
    // the plain chart tells the second group apart
    expect(v1.encoding).toEqual({
      x: { field: "mes", type: "temporal" },
      y: { field: "total", type: "quantitative" },
      color: { field: "region", type: "nominal" },
      xOffset: { field: "region", type: "nominal" },
    });
  });

  test("the gate: a patch that renders only with its author's other patch of the round reaches the vote", () => {
    // a renderer that fails when the encoding uses a field the data and the transform do not make
    const strict = (call: Parameters<Responder>[0]) =>
      ok(
        call,
        {
          results: (call.render?.specs ?? []).map((s) => {
            const spec = s.spec as {
              data: { values: Record<string, unknown>[] };
              transform?: unknown[];
              encoding?: Record<string, { field?: string }>;
            };
            const fields = new Set([
              ...Object.keys(spec.data.values[0] ?? {}),
              ...transformFields(spec.transform ?? []).names,
            ]);
            const ok = Object.values(spec.encoding ?? {}).every(
              (c) => !c.field || fields.has(c.field),
            );
            return {
              id: s.id,
              status: ok ? "ok" : "failed",
              error: ok ? "" : "The chart draws nothing.",
              svg: ok ? "<svg/>" : "",
              marks: "[]",
            };
          }),
        },
        { costUsd: 0 },
      );
    const both: Responder = (call, state) => {
      if (call.kind === "render") return strict(call);
      if (call.kind === "chart_round1" && call.seat === "openai")
        return ok(call, {
          patches: [
            {
              layer: "transform",
              path: "",
              value: '[{"calculate":"datum.ventas * 2","as":"doble"}]',
              kind: "wrong",
              reason: "Falta el doble.",
              sources: [],
              quote: "",
            },
            {
              layer: "encoding",
              path: "encoding.y",
              value: '{"field":"doble","type":"quantitative"}',
              kind: "wrong",
              reason: "El eje debe mostrar el doble.",
              sources: [],
              quote: "",
            },
            {
              layer: "caption",
              path: "",
              value: "x",
              kind: "wrong",
              reason: "Una más.",
              sources: [],
              quote: "",
            },
          ],
          checks: [],
        });
      if (call.kind === "chart_round1" && call.seat === "claude")
        return ok(call, {
          patches: [
            {
              layer: "encoding",
              path: "encoding.color",
              value: '{"field":"nada","type":"nominal"}',
              kind: "wrong",
              reason: "Color por nada.",
              sources: [],
              quote: "",
            },
          ],
          checks: [],
        });
      return userChart(call, state);
    };
    const run = drive({ mode: "thorough", question: "q", chart: { dataset: SALES } }, both);
    const opened = eventsOf(run.log, "suggestion.opened").map((e) => [
      e.suggestion.author,
      e.suggestion.target.path,
    ]);
    expect(opened).toContainEqual(["openai", "encoding.y"]);
    expect(opened).not.toContainEqual(["claude", "encoding.color"]);
    expect(run.state.chart?.dropped.find((d) => d.model === "claude")?.why).toBe("render_failed");
    // a second patch of one layer by one model is not a "no change"
    expect(run.state.chart?.dropped.find((d) => d.model === "openai")?.why).toBeUndefined();
  });
});
