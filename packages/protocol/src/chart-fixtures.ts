// Test support, not exported by the package: scripted chart runs (web data and an upload) and a
// fake renderer that fails any spec mentioning the field "nope". The real renderer (Vega in
// interpreter mode) is tested in packages/charts and in the Workers runtime.
import { parseCsv } from "./csv.ts";
import { ok, type Responder } from "./fixtures.ts";
import type { ModelId } from "./model.ts";
import type { Call, CallResult, RunState } from "./reducer.ts";

export const WEB_QUESTION = "¿Cuál fue la inflación mensual de Argentina en 2026, mes por mes?";

const src = (url: string, title: string, quote: string) => ({ url, title, quote });

export const FOUND: Record<ModelId, ReturnType<typeof src>[]> = {
  grok: [
    src("https://indec.gob.ar/ipc-enero", "INDEC enero", "La inflación de enero fue de 2,2%"),
    src("https://indec.gob.ar/ipc-febrero", "INDEC febrero", "En febrero el IPC subió 2,4%"),
    src("https://indec.gob.ar/ipc-marzo", "INDEC marzo", "marzo 3,1%"),
    src("https://consultora.example/mayo", "Consultora", "mayo 3,5%"),
  ],
  claude: [
    src("https://indec.gob.ar/ipc-enero", "INDEC enero", "La inflación de enero fue de 2,2%"),
    src("https://indec.gob.ar/ipc-febrero", "INDEC febrero", "En febrero el IPC subió 2,4%"),
    src("https://diario.example/marzo", "Diario", "en marzo el IPC subió 3%"),
    src("https://otra.example/mayo", "Otra", "mayo: 3,7%"),
  ],
  openai: [
    src("https://indec.gob.ar/ipc-enero", "INDEC enero", "La inflación de enero fue de 2,2%"),
    src("https://indec.gob.ar/ipc-febrero", "INDEC febrero", "En febrero el IPC subió 2,4%"),
    src("https://indec.gob.ar/ipc-marzo", "INDEC marzo", "marzo 3,1%"),
  ],
  gemini: [
    src("https://www.indec.gob.ar/ipc-enero/", "INDEC", "La inflación de enero fue de 2,2%"),
    src("https://bcra.example/abril", "BCRA", "abril 2,8%"),
    src("https://privada.example/febrero", "Privada", "febrero 2,5%"),
  ],
};

const row = (key: string, value: string, source: string, quote: string) => ({
  key,
  value,
  source,
  quote,
});

export const BRIEF_ROWS: Record<ModelId, ReturnType<typeof row>[]> = {
  grok: [
    row("2026-01", "2.2", "https://indec.gob.ar/ipc-enero", "La inflación de enero fue de 2,2%"),
    row("2026-02", "2.4", "https://indec.gob.ar/ipc-febrero", "En febrero el IPC subió 2,4%"),
    row("2026-03", "3.1", "https://indec.gob.ar/ipc-marzo", "marzo 3,1%"),
    row("2026-05", "3.5", "https://consultora.example/mayo", "mayo 3,5%"),
  ],
  claude: [
    row("2026-01", "2.2", "https://indec.gob.ar/ipc-enero", "enero fue de 2,2%"),
    row("2026-02", "2.4", "https://indec.gob.ar/ipc-febrero", "subió 2,4%"),
    row("2026-03", "3.0", "https://diario.example/marzo", "en marzo el IPC subió 3%"),
    row("2026-05", "3.7", "https://otra.example/mayo", "mayo: 3,7%"),
    // typed from memory: its search did not return this URL
    row("2026-06", "4.0", "https://typed.example/junio", "junio 4%"),
  ],
  openai: [
    row("2026-01", "2.2", "https://indec.gob.ar/ipc-enero", "2,2%"),
    row("2026-02", "2.40", "https://indec.gob.ar/ipc-febrero", "2,4%"),
    row("2026-03", "3.1", "https://indec.gob.ar/ipc-marzo", "marzo 3,1%"),
  ],
  gemini: [
    row("Enero 2026", "2.2", "https://indec.gob.ar/ipc-enero", "enero fue de 2,2%"),
    row("2026-04", "2.8", "https://bcra.example/abril", "abril 2,8%"),
    row("2026-07", "n/d", "https://bcra.example/abril", "sin dato"),
  ],
};

export const WRITER_SPEC = JSON.stringify({
  mark: "line",
  encoding: {
    x: { field: "key", type: "temporal", title: "Mes" },
    y: { field: "value", type: "quantitative", title: "Inflación (%)", scale: { scheme: "reds" } },
    color: { value: "red" },
  },
  config: { font: "Comic Sans MS" },
});

export const CAPTION =
  "Inflación mensual según el INDEC; en marzo y mayo las fuentes no coinciden.";

const patch = (
  layer: string,
  path: string,
  value: string,
  reason: string,
  extra: { kind?: string; sources?: string[]; quote?: string } = {},
) => ({
  layer,
  path,
  value,
  kind: extra.kind ?? "misleading",
  reason,
  sources: extra.sources ?? [],
  quote: extra.quote ?? "",
});

const check = (r: string, value: string, verdict: string) => ({
  row: r,
  value,
  verdict,
  reason: "La cita lo dice.",
});

const vote = (thread: string, choice: string) => ({ thread, choice, reason: "" });

function sourceId(state: RunState, url: string): string {
  return state.sources.find((s) => s.url === url)?.id ?? "src?";
}

/** The fake renderer: a spec that mentions the field "nope" does not render. */
export function fakeRender(call: Call): CallResult {
  return ok(
    call,
    {
      results: (call.render?.specs ?? []).map((s) => {
        const broken = JSON.stringify(s.spec).includes("nope");
        return {
          id: s.id,
          status: broken ? "failed" : "ok",
          error: broken ? 'Unrecognized field "nope".' : "",
          svg: broken ? "" : `<svg data-id="${s.id}"></svg>`,
          marks: "[]",
        };
      }),
    },
    { costUsd: 0, latencyMs: 20 },
  );
}

/** The scripted web chart run (see chart-run.test.ts for what each step shows). */
export const webChart: Responder = (call, state) => {
  const [, n, seat] = call.key.split(":") as [string, string, ModelId];
  switch (call.kind) {
    case "render":
      return fakeRender(call);
    case "brief_web":
      return ok(
        call,
        {
          question: "¿Cuánto subieron los precios cada mes?",
          dimension: "Mes",
          measure: "Inflación mensual (%)",
          mark: "line",
          rows: BRIEF_ROWS[seat],
        },
        { sources: FOUND[seat], costUsd: 0.05 },
      );
    case "chart_merge": {
      const rows = [...call.prompt.matchAll(/^- (\w+): (.*)$/gm)].map((m) => ({
        row: m[1] ?? "",
        key: /enero/i.test(m[2] ?? "") ? "2026-01" : (m[2] ?? ""),
      }));
      const drafts = [...call.prompt.matchAll(/^## Draft (\w)$/gm)].map((m) => ({
        draft: m[1] ?? "",
        measure: "same",
      }));
      return ok(call, {
        question: "¿Cuánto subieron los precios cada mes de 2026?",
        dimension: "Mes",
        measure: "Inflación mensual (%)",
        drafts,
        keys: rows,
      });
    }
    case "chart_spec":
      return ok(call, {
        spec: WRITER_SPEC,
        title: "Inflación mensual de 2026",
        caption: "Según el INDEC.",
      });
    case "chart_round1": {
      const R1: Record<ModelId, unknown> = {
        grok: {
          patches: [
            patch(
              "encoding",
              "encoding.y.title",
              '"Inflación mensual (%)"',
              "El eje no dice que es mensual.",
            ),
            patch("caption", "", CAPTION, "Falta decir qué está en duda.", { kind: "missing" }),
          ],
          checks: [
            check("2026-03", "v2", "fails"),
            check("2026-04", "v1", "holds"),
            check("2026-05", "v2", "holds"),
          ],
        },
        claude: {
          patches: [
            patch("encoding", "encoding.y.scale.scheme", '"reds"', "El rojo marca la suba."),
            patch(
              "transform",
              "",
              '[{"filter":"datum.nope > 0"}]',
              "Hay que sacar los meses sin dato.",
              {
                kind: "wrong",
              },
            ),
          ],
          checks: [
            check("2026-03", "v1", "holds"),
            check("2026-04", "v1", "holds"),
            check("2026-05", "v1", "holds"),
          ],
        },
        openai: {
          patches: [
            patch("caption", "", CAPTION, "Hay que avisar qué meses están en duda.", {
              kind: "missing",
            }),
          ],
          checks: [
            check("2026-03", "v2", "fails"),
            check("2026-04", "v1", "unclear"),
            check("2026-05", "v1", "holds"),
            check("2026-05", "v2", "holds"),
          ],
        },
        gemini: {
          patches: [
            patch("data", "2026-02", "2.5", "Una consultora mide otra cifra para febrero.", {
              kind: "wrong",
              sources: [sourceId(state, "https://privada.example/febrero")],
              quote: "febrero 2,5%",
            }),
          ],
          checks: [
            check("2026-03", "v1", "holds"),
            check("2026-03", "v2", "fails"),
            check("2026-05", "v1", "holds"),
            check("2026-05", "v2", "holds"),
          ],
        },
      };
      return ok(call, R1[seat]);
    }
    case "chart_round2": {
      const R2: Record<ModelId, unknown> = {
        grok: { votes: [], patches: [], checks: [check("2026-02", "v2", "fails")] },
        claude: {
          votes: [vote("t1", "s1"), vote("t2", "s2")],
          patches: [],
          checks: [check("2026-02", "v2", "fails")],
        },
        openai: {
          votes: [vote("t1", "s1")],
          patches: [],
          checks: [check("2026-02", "v2", "fails")],
        },
        gemini: {
          votes: [vote("t1", "keep"), vote("t2", "keep")],
          patches: [],
          checks: [check("2026-02", "v1", "holds")],
        },
      };
      return ok(call, R2[seat]);
    }
    case "chart_round3":
      return ok(call, { votes: [], checks: [] });
    case "moments":
      return ok(call, { sentences: [`Momento ${n}.`] });
    default:
      return null;
  }
};

// ---------------------------------------------------------------------------------------------
// User data

export const SALES_CSV = [
  "region;mes;ventas",
  "Norte;2026-01;100",
  "Norte;2026-02;150",
  "Sur;2026-01;80",
  'Sur;2026-02;"95,5"',
  "Oeste;2026-01;40",
  "Oeste;2026-02;",
].join("\n");

export const SALES = parseCsv(SALES_CSV);

export const SUM_BY_REGION =
  '[{"aggregate":[{"op":"sum","field":"ventas","as":"total"}],"groupby":["region"]}]';

export const userChart: Responder = (call) => {
  const [, , seat] = call.key.split(":") as [string, string, ModelId];
  switch (call.kind) {
    case "render":
      return fakeRender(call);
    case "brief_user":
      return ok(
        call,
        seat === "gemini"
          ? {
              question: "¿Cómo cambian las ventas por mes?",
              dimension: "mes",
              measures: ["ventas", "inventada"],
              mark: "line",
              transform:
                '[{"lookup":"region","from":{"data":{"values":[{"region":"Norte","ventas":999}]},"key":"region"}}]',
            }
          : {
              question: "¿Cuánto vendió cada región?",
              dimension: "region",
              measures: ["ventas"],
              mark: "bar",
              transform: SUM_BY_REGION,
            },
      );
    case "chart_spec":
      // a spec that types the data itself: refused, the plain chart of code is used
      return ok(call, {
        spec: JSON.stringify({
          data: { values: [{ region: "Norte", total: 1000 }] },
          mark: "bar",
          encoding: { x: { field: "region" }, y: { field: "total" } },
        }),
        title: "Ventas por región",
        caption: "El Norte vende más.",
      });
    case "chart_round1": {
      const R1: Record<ModelId, unknown> = {
        grok: {
          patches: [patch("data", "r1", "1000", "El Norte vendió más.", { kind: "wrong" })],
          checks: [],
        },
        claude: {
          patches: [
            patch(
              "encoding",
              "encoding.y",
              '{"datum":999,"type":"quantitative"}',
              "Falta una referencia.",
            ),
          ],
          checks: [],
        },
        openai: {
          patches: [
            patch(
              "encoding",
              "encoding.y",
              '{"field":"total","type":"quantitative","title":"Ventas totales"}',
              "El eje no dice que es la suma.",
            ),
          ],
          checks: [],
        },
        gemini: { patches: [], checks: [] },
      };
      return ok(call, R1[seat]);
    }
    case "chart_round2": {
      const R2: Record<ModelId, unknown> = {
        grok: { votes: [vote("t1", "s1")], patches: [], checks: [] },
        claude: { votes: [vote("t1", "s1")], patches: [], checks: [] },
        openai: { votes: [], patches: [], checks: [] },
        gemini: { votes: [vote("t1", "keep")], patches: [], checks: [] },
      };
      return ok(call, R2[seat]);
    }
    case "moments":
      return ok(call, { sentences: ["Momento."] });
    default:
      return null;
  }
};
