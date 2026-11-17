import { env } from "cloudflare:workers";
import { renderSpecs } from "@chebot/charts";
import { drive, startRun } from "@chebot/driver";
import { CATALOG, respondWebChart } from "@chebot/driver/testing";
import { replay, selectChart } from "@chebot/protocol";
import { FakeProvider, resolveModels } from "@chebot/providers";
import { describe, expect, test } from "vitest";
import { lazyRenderer } from "../src/worker/deps.ts";
import { runStub } from "../src/worker/run-object.ts";
import { api, contrib, eventsOf, fakes, HOOK_URL, runAlarms } from "./helpers.ts";

// Charts in the Workers runtime: the render gate (Vega in interpreter mode, step 36) and a run
// whose answer has a chart, driven by the alarms of RunObject.

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

describe("an answer with a chart through the alarms of RunObject", () => {
  test("the same versions as the CLI driver; the SVG of each version of the chart is served", async () => {
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
    });
    await stub.pay({ hookUrl: HOOK_URL, free: true });
    await runAlarms(stub);
    expect(provider.repeated()).toEqual([]);
    const summary = await stub.summary();
    expect(summary).toMatchObject({ status: "completed", charts: 1, version: 3 });

    const log = await eventsOf(stub);
    const view = replay(log);
    const cli = await drive(
      startRun(
        {
          id,
          question: WEB_QUESTION,
          mode: "thorough",
          models: resolveModels([], CATALOG),
        },
        1_800_000_000_000,
      ),
      {
        provider: new FakeProvider({ respond: respondWebChart }),
        renderer: { render: renderSpecs },
      },
    );
    expect(view.snapshots).toEqual(cli.state.snapshots);
    expect(view.disputes).toEqual(cli.state.charts.disputes);
    expect(view.renders).toEqual(cli.state.charts.renders);
    expect(view.snapshots.at(-1)?.order).toEqual(["p1", "c1", "p2"]);
    const chart = selectChart(view, "c1");
    expect(chart?.rows.map((r) => [r.key, r.status])).toEqual([
      ["2026-01", "agreed"],
      ["2026-03", "held"],
      ["2026-05", "unsettled"],
    ]);
    expect(view.droppedPatches.map((d) => d.why)).toEqual(["theme_only", "render_failed"]);

    for (const version of [1, 2, 3]) {
      const response = await api(`/api/runs/${id}/charts/c1/${version}.svg`);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("image/svg+xml; charset=utf-8");
      expect(await response.text()).toMatch(/^<svg/);
    }
    expect((await api(`/api/runs/${id}/charts/c1/9.svg`)).status).toBe(404);
    expect((await api(`/api/runs/${id}/charts/c2/1.svg`)).status).toBe(404);
  });

  test("through the API a question is only a question: the drafts decide on the charts", async () => {
    fakes({ respond: respondWebChart });
    const asked = await api("/api/runs", {
      method: "POST",
      headers: { ...contrib("chart-user"), "content-type": "application/json" },
      body: JSON.stringify({ question: WEB_QUESTION }),
    });
    expect(asked.status).toBe(201);
    const { runId } = (await asked.json()) as { runId: string };
    const stub = runStub(env, runId);
    expect(await stub.summary()).toMatchObject({ status: "quoted", charts: 0 });
    await stub.pay({ hookUrl: HOOK_URL, free: true });
    await runAlarms(stub);
    expect(await stub.summary()).toMatchObject({ status: "completed", charts: 1 });
  });
});
