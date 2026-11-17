import { env } from "cloudflare:workers";
import { renderSpecs } from "@chebot/charts";
import { drive, startRun } from "@chebot/driver";
import { CATALOG, respondUserChart, respondWebChart, SALES_CSV } from "@chebot/driver/testing";
import { chartSpec, replay, selectChart } from "@chebot/protocol";
import { FakeProvider, resolveModels } from "@chebot/providers";
import { describe, expect, test } from "vitest";
import { lazyRenderer } from "../src/worker/deps.ts";
import { runStub } from "../src/worker/run-object.ts";
import { api, beta, eventsOf, fakes, HOOK_URL, runAlarms } from "./helpers.ts";

// Charts in the Workers runtime: the render gate (Vega in interpreter mode, step 36) and a chart
// run driven by the alarms of RunObject (steps 37 to 40).

const WEB_QUESTION = "¿Cuál fue la inflación mensual de Argentina en 2026?";

describe("the render gate in the Workers runtime", () => {
  test("compiles and renders Vega-Lite to SVG in interpreter mode, expressions included", async () => {
    const started = performance.now();
    const out = await lazyRenderer.render({
      key: "render:test",
      signal: AbortSignal.timeout(10_000),
      specs: [
        {
          id: "a",
          spec: {
            data: {
              values: [
                { a: "x", b: 3 },
                { a: "y", b: 5 },
              ],
            },
            transform: [{ calculate: "datum.b * 2", as: "c" }, { filter: "datum.c > 7" }],
            mark: "bar",
            encoding: {
              x: { field: "a", type: "nominal" },
              y: { field: "c", type: "quantitative" },
            },
          },
        },
        {
          id: "broken",
          spec: {
            data: { values: [{ a: 1 }] },
            transform: [{ filter: "datum.a >" }],
            mark: "point",
            encoding: {},
          },
        },
      ],
    });
    const elapsed = performance.now() - started;
    expect(out.results.map((r) => [r.id, r.status])).toEqual([
      ["a", "ok"],
      ["broken", "failed"],
    ]);
    expect(out.results[0]?.svg).toMatch(/^<svg/);
    expect(JSON.parse(out.results[0]?.marks ?? "[]")).toEqual([
      expect.objectContaining({ a: "y", c: 10 }),
    ]);
    // the first render loads the module; both stay far under the 1 s startup limit of a Worker
    expect(elapsed).toBeLessThan(5_000);
  });
});

describe("a chart run through the alarms of RunObject", () => {
  test("web data: the same chart versions as the CLI driver; the SVG of each version is served", async () => {
    const { provider } = fakes({ respond: respondWebChart });
    const id = crypto.randomUUID();
    const stub = runStub(env, id);
    await stub.quote({
      id,
      owner: "owner-chart",
      question: WEB_QUESTION,
      class: "complex",
      probability: 0.9,
      amount: 10000,
      currency: "ARS",
      chart: { dataset: null },
    });
    await stub.pay({ hookUrl: HOOK_URL, free: true });
    await runAlarms(stub);
    expect(provider.repeated()).toEqual([]);
    const summary = await stub.summary();
    expect(summary).toMatchObject({ status: "completed", chart: "web", version: 3 });

    const log = await eventsOf(stub);
    const view = replay(log);
    const cli = await drive(
      startRun(
        {
          id,
          question: WEB_QUESTION,
          mode: "thorough",
          models: resolveModels([], CATALOG),
          chart: { dataset: null },
        },
        1_800_000_000_000,
      ),
      {
        provider: new FakeProvider({ respond: respondWebChart }),
        renderer: { render: renderSpecs },
      },
    );
    expect(view.snapshots).toEqual(cli.state.snapshots);
    expect(view.disputes).toEqual(cli.state.chart?.disputes);
    expect(view.renders).toEqual(cli.state.chart?.renders);
    const chart = selectChart(view);
    expect(chart?.rows.map((r) => [r.key, r.status])).toEqual([
      ["2026-01", "agreed"],
      ["2026-03", "held"],
      ["2026-05", "unsettled"],
    ]);
    expect(view.droppedPatches.map((d) => d.why)).toEqual(["theme_only", "render_failed"]);

    for (const version of [1, 2, 3]) {
      const response = await api(`/api/runs/${id}/charts/${version}.svg`);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("image/svg+xml; charset=utf-8");
      expect(await response.text()).toMatch(/^<svg/);
    }
    expect((await api(`/api/runs/${id}/charts/9.svg`)).status).toBe(404);
  });

  test("user data through the API: the CSV is parsed when asked; no number of the chart is a model's", async () => {
    fakes({ respond: respondUserChart });
    const bad = await api("/api/runs", {
      method: "POST",
      headers: { ...beta("csv-user"), "content-type": "application/json" },
      body: JSON.stringify({ question: "¿Cuánto vendió cada región?", chart: { csv: "a,b\n1" } }),
    });
    expect(bad.status).toBe(400);
    const asked = await api("/api/runs", {
      method: "POST",
      headers: { ...beta("csv-user"), "content-type": "application/json" },
      body: JSON.stringify({ question: "¿Cuánto vendió cada región?", chart: { csv: SALES_CSV } }),
    });
    expect(asked.status).toBe(201);
    const { runId } = (await asked.json()) as { runId: string };
    const stub = runStub(env, runId);
    await stub.pay({ hookUrl: HOOK_URL, free: true });
    await runAlarms(stub);
    expect(await stub.summary()).toMatchObject({ status: "completed", chart: "user" });
    const view = replay(await eventsOf(stub));
    expect(view.chart?.origin).toBe("user");
    const chart = selectChart(view);
    if (!chart) throw new Error("no chart");
    const values = (chart.spec.data as { values: unknown[] }).values;
    expect(values).toEqual(view.chart?.dataset?.rows);
    expect(values).toHaveLength(5);
    expect(view.droppedPatches.map((d) => [d.layer, d.why])).toEqual([["data", "user_data"]]);
    // what the chart draws is the sum by region of the uploaded rows
    const rendered = await renderSpecs({
      specs: [{ id: "x", spec: chartSpec(view.snapshots.at(-1)?.blocks.c1 as never) }],
    });
    const drawn = JSON.parse(rendered.results[0]?.marks ?? "[]") as {
      region: string;
      total: number;
    }[];
    expect(Object.fromEntries(drawn.map((m) => [m.region, m.total]))).toEqual({
      Norte: 250,
      Sur: 175.5,
      Oeste: 40,
    });
  });
});
