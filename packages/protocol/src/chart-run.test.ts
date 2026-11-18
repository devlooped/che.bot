import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { selectAnswer, selectChart } from "./answer.ts";
import { chartSpec, transformFields } from "./chart.ts";
import {
  BRIEF_ROWS,
  CAPTION,
  DRAFT_CHARTS,
  FOUND,
  MARCH,
  WEB_QUESTION,
  webChart,
} from "./chart-fixtures.ts";
import { holdsUp } from "./chart-run.ts";
import { DEFAULT_CONFIG } from "./config.ts";
import { drive, eventsOf, ok, type Responder } from "./fixtures.ts";
import type { Chart, ModelId } from "./model.ts";
import { templateMoments } from "./moments.ts";
import { replay } from "./replay.ts";
import { clone, seededShuffle } from "./util.ts";

const webRun = () => drive({ mode: "thorough", question: WEB_QUESTION }, webChart);
const chartOf = (s: { blocks: Record<string, unknown> }, id = "c1") => s.blocks[id] as Chart;
const answerOf = (state: ReturnType<typeof webRun>["state"], block = "c1", version?: number) =>
  selectChart(
    { ...state, disputes: state.charts.disputes, renders: state.charts.renders },
    block,
    version,
  );

describe("a scripted run whose answer has two charts among its paragraphs", () => {
  const run = webRun();
  const { state, log } = run;
  const keys = run.steps.flatMap((s) => s.calls.map((c) => c.key));

  test("goes through every stage: drafts, merge, specs, render gate, rounds, editor", () => {
    expect(state.status).toBe("completed");
    expect(eventsOf(log, "stage.changed").map((e) => e.stage)).toEqual([
      "drafting",
      "merging",
      "round1",
      "round2",
      "editing",
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
      "edit",
      "edit_check",
      "moments",
      "finish",
    ]);
    expect(keys).toEqual(
      expect.arrayContaining([
        "draft:0:grok",
        "merge:0",
        "chart-merge:0",
        "spec:c1:grok",
        "spec:c2:claude",
        "render:seed",
        "round:1:gemini",
        "render:gate:1",
        "render:v2",
        "round:2:claude",
        "render:v3",
        "edit:0:grok",
      ]),
    );
    expect(new Set(keys).size).toBe(keys.length);
    // the bound of a prose run, plus one spec per chart: 4 drafts, 2 specs, 8 round calls, the editor
    const panel = run.steps.flatMap((s) =>
      s.calls.filter((c) => c.seat !== "utility" && c.seat !== "renderer"),
    );
    expect(panel).toHaveLength(15);
  });

  test("the drafts search and propose charts; a row without a citation of that call, or without a number, is dropped", () => {
    expect(run.steps[0]?.calls.every((c) => c.search?.maxResults === 10)).toBe(true);
    expect(run.steps[0]?.calls[0]?.system).toContain("charts: up to 3");
    const drafts = eventsOf(log, "draft.completed");
    const of = (m: ModelId) => drafts.find((d) => d.model === m)?.charts ?? [];
    expect(of("claude").map((b) => b.measure)).toEqual([
      "Inflación mensual (%)",
      "Desocupación (%)",
    ]);
    expect(of("claude")[0]?.dropped).toEqual([{ key: "2026-06", why: "no_citation" }]);
    expect(of("gemini")[0]?.dropped).toEqual([{ key: "2026-07", why: "not_a_number" }]);
    expect(state.charts.briefs.map((b) => b.id)).toEqual([
      "D1",
      "D2",
      "B1",
      "B2",
      "A1",
      "A2",
      "C1",
    ]);
    // every row's source is a search result of the run
    const ids = new Set(state.sources.map((s) => s.id));
    for (const id of ["c1", "c2"])
      for (const r of chartOf(state.snapshots[0] as never, id).data.rows)
        for (const v of [r, ...r.alternatives]) expect(ids.has(v.source)).toBe(true);
  });

  test("a measure two drafts or more chart is a chart; one only one draft charts is declined", () => {
    expect(
      Object.values(state.charts.plans).map((p) => [p.id, p.briefs, p.base.brief.measures]),
    ).toEqual([
      ["c1", ["A1", "B1", "C1", "D1"], ["Inflación mensual (%)"]],
      ["c2", ["B2", "D2"], ["Desocupación (%)"]],
    ]);
    expect(eventsOf(log, "chart.declined")).toEqual([
      expect.objectContaining({
        measure: "Salario real (%)",
        briefs: ["A2"],
        models: ["openai"],
        why: "one_draft",
      }),
    ]);
  });

  test("the merge: same value from several models is support, different values are kept with their sources", () => {
    const v1 = chartOf(state.snapshots[0] as never);
    const row = (k: string) => v1.data.rows.find((r) => r.key === k);
    expect(v1.data.rows.map((r) => r.key)).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
    ]);
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
      alternatives: [{ values: { value: 3.4 }, support: ["claude"] }],
    });
    expect(row("2026-04")).toMatchObject({ status: "single", support: ["gemini"] });
    expect(chartOf(state.snapshots[0] as never, "c2").data.rows.map((r) => r.status)).toEqual([
      "agreed",
      "agreed",
    ]);
    expect(
      eventsOf(log, "dispute.opened").map((e) => [
        e.dispute.id,
        e.dispute.block,
        e.dispute.row,
        e.dispute.openedRound,
      ]),
    ).toEqual([
      ["d1", "c1", "2026-03", 0],
      ["d2", "c1", "2026-04", 0],
      ["d3", "c1", "2026-05", 0],
      ["d4", "c1", "2026-02", 1],
    ]);
  });

  test("one model writes each spec, a different one per chart, and places the chart; version 1 is their render", () => {
    expect(eventsOf(log, "chart.written")).toEqual([
      expect.objectContaining({
        block: "c1",
        writer: "grok",
        used: "writer",
        stripped: ["encoding.y.scale.scheme", "encoding.color.value"],
      }),
      expect.objectContaining({ block: "c2", writer: "claude", used: "writer", stripped: [] }),
    ]);
    const spec = run.steps.find((s) => s.phase === "spec");
    expect(spec?.calls[0]?.prompt).toContain("[p1]");
    expect(state.snapshots.map((s) => s.order)).toEqual(
      state.snapshots.map(() => ["p1", "c1", "p2", "c2"]),
    );
    const v1 = chartOf(state.snapshots[0] as never);
    expect(v1.mark).toBe("line");
    expect(v1.encoding).toEqual({
      x: { field: "key", type: "temporal", title: "Mes" },
      y: { field: "value", type: "quantitative", title: "Inflación (%)" },
    });
    // a version that left a chart as it was keeps its render, without a render call
    expect(state.charts.renders.map((r) => [r.block, r.version, r.call, r.result, r.ok])).toEqual([
      ["c1", 1, "render:seed", "c1:writer", true],
      ["c2", 1, "render:seed", "c2:writer", true],
      ["c2", 2, "render:seed", "c2:writer", true],
      ["c1", 2, "render:v2", "c1", true],
      ["c1", 3, "render:v3", "c1", true],
      ["c2", 3, "render:v3", "c2", true],
      ["c1", 4, "render:v3", "c1", true],
      ["c2", 4, "render:v3", "c2", true],
    ]);
    expect(
      run.steps
        .find((s) => s.calls[0]?.key === "render:v2")
        ?.calls[0]?.render?.specs.map((s) => s.id),
    ).toEqual(["c1"]);
  });

  test("a patch that does not render never reaches a vote; a patch of the theme is dropped", () => {
    expect(state.charts.dropped.map((d) => [d.model, d.block, d.layer, d.why])).toEqual([
      ["claude", "c1", "encoding", "theme_only"],
      ["claude", "c1", "transform", "render_failed"],
    ]);
    const opened = eventsOf(log, "suggestion.opened").map((e) => e.suggestion);
    expect(opened.some((s) => s.text.includes("nope") || s.text.includes("reds"))).toBe(false);
    // the gate rendered only the patches that are drawn: not a caption, not a paragraph
    const gate = run.steps.find((s) => s.phase === "gate")?.calls[0];
    expect(gate?.render?.specs.map((s) => s.id)).toEqual(["p0", "p2", "p4"]);
  });

  test("one round settles the text and the charts: a thread per paragraph and per layer of each chart", () => {
    expect(Object.values(state.threads).map((t) => [t.id, t.lockKey, t.state, t.winner])).toEqual([
      ["t1", "c1/encoding", "accepted", "s1"],
      ["t2", "c1/caption", "accepted", "s2"],
      ["t3", "c2/title", "accepted", "s3"],
      ["t4", "p2", "accepted", "s4"],
    ]);
    expect(state.suggestions.s2?.coAuthors).toEqual(["openai"]);
    const v3 = state.snapshots.find((s) => s.version === 3) as never;
    expect(chartOf(v3).caption).toBe(CAPTION);
    expect((chartOf(v3).encoding.y as { title: string }).title).toBe("Inflación mensual (%)");
    expect(chartOf(v3, "c2").title).toBe("Desocupación trimestral (%)");
    expect((v3 as { blocks: { p2: { text: string } } }).blocks.p2.text).toBe(MARCH);
    // the round prompt shows the paragraphs with the charts in their place, and the charts in full
    const prompt = run.steps.find((s) => s.phase === "round")?.calls[0]?.prompt ?? "";
    expect(prompt).toContain('[c1] (a chart: see "Charts" below)');
    expect(prompt).toContain("### Chart c2");
  });

  test("the editor runs because a paragraph changed; it sees the charts and changes only paragraphs", () => {
    const edit = run.steps.find((s) => s.phase === "edit")?.calls[0];
    expect(edit?.prompt).toContain("[c1] (a chart, not yours to change)");
    const last = state.snapshots.at(-1);
    expect(eventsOf(log, "snapshot.created").at(-1)).toMatchObject({ cause: "edit" });
    expect(chartOf(last as never)).toEqual(chartOf(state.snapshots[2] as never));
    expect(state.edit?.kept).toEqual(["p1"]);
  });

  test("rows are settled by source, never by a vote on the number", () => {
    expect(Object.values(state.charts.disputes).map((d) => [d.row, d.state, d.winner])).toEqual([
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
    const d1 = state.charts.disputes.d1 ? clone(state.charts.disputes.d1) : undefined;
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

  test("the answer: the paragraphs, and each chart with its data, sources, disputes and render", () => {
    expect(selectAnswer(state)?.paragraphs.map((p) => p.id)).toEqual(["p1", "p2"]);
    const answer = answerOf(state);
    expect(answer).toMatchObject({ version: 4, final: true, title: "Inflación mensual de 2026" });
    expect(answer?.rows.every((r) => r.source?.url.startsWith("https://"))).toBe(true);
    expect(
      answer?.disputed.map((r) => [r.key, r.status, r.alternatives.map((a) => a.source?.url)]),
    ).toEqual([["2026-05", "unsettled", ["https://otra.example/mayo"]]]);
    expect(answer?.rows.find((r) => r.key === "2026-03")?.dispute).toMatchObject({
      state: "held",
      winner: "v1",
      values: [
        { id: "v1", value: 3.1, holds: 2, checkers: 2 },
        { id: "v2", value: 3.4, holds: 0, checkers: 3 },
      ],
    });
    expect(answer?.render).toMatchObject({ block: "c1", version: 4, call: "render:v3" });
    expect(answerOf(state, "c1", 1)?.rows.find((r) => r.key === "2026-03")?.status).toBe(
      "disputed",
    );
    expect(answerOf(state, "c2")).toMatchObject({ title: "Desocupación trimestral (%)" });
    expect(answerOf(state, "p1")).toBeNull();
  });

  test("the template moments speak of the charts, the sources and the declined proposals", () => {
    const of = (types: string[]) => log.filter((e) => types.includes(e.type));
    expect(templateMoments(of(["document.seeded", "dispute.settled"]))).toEqual([
      "Sumamos a la respuesta 2 gráficos con 7 datos, y 3 quedan para verificar con las fuentes.",
      "3 datos quedaron confirmados por su fuente; en 1 las fuentes no coinciden y se muestra el rango.",
      "Juntamos las respuestas en un solo texto y coinciden en todo.",
    ]);
    expect(templateMoments(of(["chart.declined"]))).toEqual([
      "ChatGPT propuso un gráfico, pero los demás no lo armaron, así que la respuesta sigue sin él.",
    ]);
    expect(templateMoments(of(["thread.accepted"]), { suggestions: state.suggestions })).toEqual([
      "Se aceptaron 4 cambios al texto y a los gráficos.",
    ]);
  });

  test("replaying the events alone rebuilds every version, the disputes and the renders", () => {
    const view = replay(log);
    expect(view.snapshots).toEqual(state.snapshots);
    expect(view.versions.map((v) => [v.version, v.cause])).toEqual([
      [1, "merge"],
      [2, "round"],
      [3, "round"],
      [4, "edit"],
    ]);
    expect(view.disputes).toEqual(state.charts.disputes);
    expect(view.renders).toEqual(state.charts.renders);
    expect(view.droppedPatches).toEqual(state.charts.dropped);
    expect(view.briefs).toEqual(state.charts.briefs);
    expect(view.declined.map((d) => d.measure)).toEqual(["Salario real (%)"]);
    expect(view.written.c2).toMatchObject({ writer: "claude", used: "writer" });
    for (const s of state.snapshots)
      for (const id of ["c1", "c2"])
        expect(selectChart(view, id, s.version)).toEqual(answerOf(state, id, s.version));
  });

  test("the same results in any order give the same versions", () => {
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        const shuffled = drive({ mode: "thorough", question: WEB_QUESTION }, webChart, {
          permute: (results, i) => seededShuffle(results, `${seed}|${i}`),
        });
        expect(shuffled.state.snapshots).toEqual(state.snapshots);
        expect(shuffled.state.charts.disputes).toEqual(state.charts.disputes);
      }),
      { numRuns: 25 },
    );
  });
});

describe("when the answer has charts", () => {
  const withCharts =
    (charts: (m: ModelId) => unknown[]): Responder =>
    (call, state) =>
      call.kind === "draft"
        ? ok(
            call,
            {
              answer: "Una respuesta.",
              claims: [{ text: "Una respuesta.", confidence: "high", sources: [] }],
              charts: charts(call.seat as ModelId),
            },
            { sources: FOUND[call.seat as ModelId] },
          )
        : webChart(call, state);
  const inflation = (m: ModelId) => DRAFT_CHARTS[m][0];

  test("a chart one draft alone proposes is declined: no grouping call, the answer is prose", () => {
    const run = drive(
      { mode: "thorough", question: WEB_QUESTION },
      withCharts((m) => (m === "grok" ? [inflation(m)] : [])),
    );
    expect(run.state.status).toBe("completed");
    expect(run.steps.flatMap((s) => s.calls.map((c) => c.kind))).not.toContain("chart_merge");
    expect(eventsOf(run.log, "chart.declined")).toEqual([
      expect.objectContaining({ briefs: ["D1"], models: ["grok"], why: "one_draft" }),
    ]);
    expect(run.state.snapshots.at(-1)?.order).toEqual(["p1", "p2"]);
  });

  test("drafts that chart different measures give no chart", () => {
    const measures: Record<ModelId, string> = {
      grok: "Inflación mensual (%)",
      claude: "Inflación anual (%)",
      openai: "Precio del dólar ($)",
      gemini: "Tasa de interés (%)",
    };
    const run = drive(
      { mode: "thorough", question: WEB_QUESTION },
      withCharts((m) => [{ ...inflation("grok"), measure: measures[m], rows: BRIEF_ROWS.grok }]),
    );
    expect(run.steps.flatMap((s) => s.calls.map((c) => c.kind))).toContain("chart_merge");
    expect(eventsOf(run.log, "chart.declined").map((e) => e.why)).toEqual([
      "one_draft",
      "one_draft",
      "one_draft",
      "one_draft",
    ]);
    expect(Object.keys(run.state.charts.plans)).toEqual([]);
    expect(run.state.snapshots.at(-1)?.order).toEqual(["p1", "p2"]);
  });

  test("at most three charts: a fourth measure is declined", () => {
    const measures: Record<ModelId, string[]> = {
      grok: ["A (%)", "B (%)"],
      claude: ["A (%)", "B (%)"],
      openai: ["C (%)", "D (%)"],
      gemini: ["C (%)", "D (%)"],
    };
    const run = drive(
      { mode: "quick", question: WEB_QUESTION },
      withCharts((m) =>
        measures[m].map((measure) => ({ ...inflation("grok"), measure, rows: BRIEF_ROWS.grok })),
      ),
    );
    // the four groups have two drafts each: the first three the grouping lists are drawn
    const plans = Object.values(run.state.charts.plans);
    expect(plans.map((p) => [p.id, p.base.brief.measures[0]])).toEqual([
      ["c1", "C (%)"],
      ["c2", "D (%)"],
      ["c3", "A (%)"],
    ]);
    expect(eventsOf(run.log, "chart.declined")).toEqual([
      expect.objectContaining({ measure: "B (%)", models: ["grok", "claude"], why: "over_cap" }),
    ]);
    // no model writes two specs while another model of the chart is free
    expect(plans[0]?.writer).not.toBe(plans[1]?.writer);
    // each chart goes after the paragraph its writer named (the fixture: c1 after p1, others after p2)
    expect(run.state.snapshots.at(-1)?.order).toEqual(["p1", "c1", "p2", "c2", "c3"]);
  });

  test("a change to a chart alone does not call the editor", () => {
    const noParagraph: Responder = (call, state) => {
      const out = webChart(call, state);
      if (call.kind === "round1" && call.seat === "gemini" && out?.status === "ok")
        return { ...out, output: { ...(out.output as object), suggestions: [] } };
      return out;
    };
    const run = drive({ mode: "thorough", question: WEB_QUESTION }, noParagraph);
    expect(run.state.status).toBe("completed");
    expect(Object.values(run.state.threads).every((t) => t.block.startsWith("c"))).toBe(true);
    expect(run.steps.some((s) => s.phase === "edit")).toBe(false);
  });

  test("quick mode stops at the seeded document; what no round checked is settled and rendered", () => {
    const quick = drive({ mode: "quick", question: WEB_QUESTION }, webChart);
    expect(quick.state.status).toBe("completed");
    const keys = quick.steps.flatMap((s) => s.calls.map((c) => c.key));
    expect(new Set(keys).size).toBe(keys.length);
    expect(quick.steps.map((s) => s.phase)).toEqual([
      "draft",
      "merge",
      "spec",
      "seed",
      "moments",
      "settle",
      "render",
      "moments",
      "finish",
    ]);
    // nothing was checked: the conflict of May is drawn as a range in the version that closes the run
    expect(quick.state.snapshots).toHaveLength(2);
    expect(Object.values(quick.state.charts.disputes).map((d) => d.state)).toEqual([
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
    const two: Responder = (call, state) =>
      call.kind === "draft" && (call.seat === "grok" || call.seat === "claude")
        ? null
        : webChart(call, state);
    const few = drive({ mode: "thorough", question: WEB_QUESTION }, two);
    expect(few.state.flags.fewDrafts).toBe(true);
    expect(few.steps.some((s) => s.phase === "round")).toBe(false);
  });

  test("a writer that fails gives the plain chart of code; a version that does not render is undone", () => {
    // version 3 takes the patches of round 2: c1 does not render with them
    const broken: Responder = (call, state) => {
      if (call.kind === "chart_spec") return null;
      if (call.kind === "render" && call.key === "render:v3") {
        const out = webChart(call, state);
        if (out?.status !== "ok") return out;
        const results = (out.output as { results: { id: string }[] }).results.map((r) =>
          r.id === "c1" ? { ...r, status: "failed", error: "boom", svg: "" } : r,
        );
        return { ...out, output: { results } };
      }
      return webChart(call, state);
    };
    const run = drive({ mode: "thorough", question: WEB_QUESTION }, broken);
    expect(eventsOf(run.log, "chart.written")[0]).toMatchObject({ used: "plain", why: "no spec" });
    const c1 = run.state.charts.renders.filter((r) => r.block === "c1");
    expect(c1.slice(0, 4).map((r) => [r.version, r.ok])).toEqual([
      [1, true],
      [2, true],
      [3, false],
      [4, true],
    ]);
    const at = (v: number) => run.state.snapshots.find((s) => s.version === v) as never;
    expect(eventsOf(run.log, "snapshot.created").find((e) => e.snapshot.version === 4)?.cause).toBe(
      "render",
    );
    // the drawn layers of c1 come back from version 2, the settled rows stay; c2 keeps its change
    expect(chartOf(at(4)).encoding).toEqual(chartOf(at(2)).encoding);
    expect(chartOf(at(4)).caption).toEqual(chartOf(at(2)).caption);
    expect(chartOf(at(4)).data).toEqual(chartOf(at(3)).data);
    expect(chartOf(at(4), "c2")).toEqual(chartOf(at(3), "c2"));
    expect(run.state.charts.renders.find((r) => r.block === "c2" && r.version === 4)?.ok).toBe(
      true,
    );
    expect(run.state.status).toBe("completed");
  });

  test("the deadline does not cut a render: the last version is rendered after it", () => {
    const run = drive(
      { mode: "thorough", question: WEB_QUESTION },
      webChart,
      // round 2 ends past the deadline
      {
        tick: (s) =>
          s.phase === "round" && s.stage === "round2" ? DEFAULT_CONFIG.deadlineMs.thorough : 1000,
      },
    );
    const lastRender = run.steps.filter((s) => s.phase === "render").at(-1)?.calls[0];
    expect(lastRender?.timeoutMs).toBe(run.state.config.callTimeoutMs.render);
    expect(run.state.calls["round:2:grok"]).toBeDefined();
    const last = run.state.snapshots.at(-1)?.version;
    for (const id of ["c1", "c2"])
      expect(run.state.charts.renders.some((r) => r.block === id && r.version === last)).toBe(true);
  });

  test("the gate: a patch that renders only with its author's other patch of the chart reaches the vote", () => {
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
            const fine = Object.values(spec.encoding ?? {}).every(
              (c) => !c.field || fields.has(c.field),
            );
            return {
              id: s.id,
              status: fine ? "ok" : "failed",
              error: fine ? "" : "The chart draws nothing.",
              svg: fine ? "<svg/>" : "",
              marks: "[]",
            };
          }),
        },
        { costUsd: 0 },
      );
    const patch = (layer: string, path: string, value: string, reason: string) => ({
      chart: "c1",
      layer,
      path,
      value,
      kind: "wrong",
      reason,
      sources: [],
      quote: "",
    });
    const both: Responder = (call, state) => {
      if (call.kind === "render") return strict(call);
      if (call.kind === "round1" && call.seat === "openai")
        return ok(call, {
          suggestions: [],
          patches: [
            patch(
              "transform",
              "",
              '[{"calculate":"datum.value * 2","as":"doble"}]',
              "Falta el doble.",
            ),
            patch(
              "encoding",
              "encoding.y",
              '{"field":"doble","type":"quantitative"}',
              "El eje debe mostrar el doble.",
            ),
            patch("caption", "", "x", "Una más."),
          ],
          checks: [],
        });
      if (call.kind === "round1" && call.seat === "claude")
        return ok(call, {
          suggestions: [],
          patches: [
            patch(
              "encoding",
              "encoding.color",
              '{"field":"nada","type":"nominal"}',
              "Color por nada.",
            ),
          ],
          checks: [],
        });
      return webChart(call, state);
    };
    const run = drive({ mode: "thorough", question: WEB_QUESTION }, both);
    const opened = eventsOf(run.log, "suggestion.opened").map((e) => [
      e.suggestion.author,
      e.suggestion.target.path,
    ]);
    expect(opened).toContainEqual(["openai", "encoding.y"]);
    expect(opened).not.toContainEqual(["claude", "encoding.color"]);
    expect(run.state.charts.dropped.find((d) => d.model === "claude")?.why).toBe("render_failed");
    // a second patch of one layer by one model is not a "no change"
    expect(run.state.charts.dropped.find((d) => d.model === "openai")?.why).toBeUndefined();
  });

  test("a patch names a chart of the answer", () => {
    const unknown: Responder = (call, state) => {
      if (call.kind === "round1" && call.seat === "grok")
        return ok(call, {
          suggestions: [],
          patches: [
            {
              chart: "c9",
              layer: "title",
              path: "",
              value: "Otro",
              kind: "wrong",
              reason: "No existe.",
              sources: [],
              quote: "",
            },
          ],
          checks: [],
        });
      return webChart(call, state);
    };
    const run = drive({ mode: "thorough", question: WEB_QUESTION }, unknown);
    expect(run.state.charts.dropped.find((d) => d.model === "grok")).toMatchObject({
      block: "c9",
      why: "unknown_chart",
    });
  });
});
