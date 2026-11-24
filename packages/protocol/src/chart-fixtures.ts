// Test support, not exported by the package: a scripted run whose answer has two charts among its
// paragraphs, and a fake renderer that fails any spec mentioning the field "nope". The real
// renderer (Vega in interpreter mode) is tested in packages/charts and in the Workers runtime.
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
    src("https://indec.gob.ar/eph", "INDEC EPH", "desocupación: 7,1% y 6,9%"),
  ],
  claude: [
    src("https://indec.gob.ar/ipc-enero", "INDEC enero", "La inflación de enero fue de 2,2%"),
    src("https://indec.gob.ar/ipc-febrero", "INDEC febrero", "En febrero el IPC subió 2,4%"),
    src("https://diario.example/marzo", "Diario", "en marzo el IPC subió 3,4%"),
    src("https://otra.example/mayo", "Otra", "mayo: 3,7%"),
    src("https://indec.gob.ar/eph", "INDEC EPH", "desocupación: 7,1% y 6,9%"),
  ],
  openai: [
    src("https://indec.gob.ar/ipc-enero", "INDEC enero", "La inflación de enero fue de 2,2%"),
    src("https://indec.gob.ar/ipc-febrero", "INDEC febrero", "En febrero el IPC subió 2,4%"),
    src("https://indec.gob.ar/ipc-marzo", "INDEC marzo", "marzo 3,1%"),
    src("https://indec.gob.ar/salarios", "INDEC salarios", "los salarios subieron 2,0%"),
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
    row("2026-03", "3.4", "https://diario.example/marzo", "en marzo el IPC subió 3,4%"),
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

/** The rows of the second measure, which grok and claude chart alike: no dispute. */
export const UNEMPLOYMENT_ROWS = [
  row("2025-T4", "7.1", "https://indec.gob.ar/eph", "desocupación: 7,1%"),
  row("2026-T1", "6.9", "https://indec.gob.ar/eph", "6,9%"),
];

const brief = (measure: string, mark: string, rows: ReturnType<typeof row>[]) => ({
  question: measure.startsWith("Inflación")
    ? "¿Cuánto subieron los precios cada mes?"
    : `¿Cómo evolucionó la ${measure.toLowerCase()}?`,
  dimension: measure.startsWith("Inflación") ? "Mes" : "Trimestre",
  measure,
  mark,
  rows,
});

/** The charts each draft proposes: inflation (all four), unemployment (two), wages (openai alone). */
export const DRAFT_CHARTS: Record<ModelId, ReturnType<typeof brief>[]> = {
  grok: [
    brief("Inflación mensual (%)", "line", BRIEF_ROWS.grok),
    brief("Desocupación (%)", "bar", UNEMPLOYMENT_ROWS),
  ],
  claude: [
    brief("Inflación mensual (%)", "line", BRIEF_ROWS.claude),
    brief("Desocupación (%)", "bar", UNEMPLOYMENT_ROWS),
  ],
  openai: [
    brief("Inflación mensual (%)", "line", BRIEF_ROWS.openai),
    brief("Salario real (%)", "bar", [
      row("2026-01", "2.0", "https://indec.gob.ar/salarios", "los salarios subieron 2,0%"),
    ]),
  ],
  gemini: [brief("Inflación mensual (%)", "line", BRIEF_ROWS.gemini)],
};

/** The claims of every draft: the text agrees, the figures are in the charts. */
const CLAIMS = [
  "La inflación mensual se moderó durante 2026.",
  "Marzo fue el mes de mayor inflación.",
];
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
  chart: string,
  layer: string,
  path: string,
  value: string,
  reason: string,
  extra: { kind?: string; sources?: string[]; quote?: string } = {},
) => ({
  chart,
  layer,
  path,
  value,
  kind: extra.kind ?? "misleading",
  reason,
  sources: extra.sources ?? [],
  quote: extra.quote ?? "",
});

const check = (r: string, value: string, verdict: string, chart = "c1") => ({
  chart,
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

/** The paragraph gemini wants to make precise in round 1, accepted in round 2. */
export const MARCH = "Marzo fue el mes de mayor inflación, con 3,1% según el INDEC.";

/**
 * The scripted run with charts (see chart-run.test.ts for what each step shows). The answer: p1,
 * the inflation chart c1, p2, the unemployment chart c2.
 */
export const webChart: Responder = (call, state) => {
  const [, n, seat] = call.key.split(":") as [string, string, ModelId];
  switch (call.kind) {
    case "render":
      return fakeRender(call);
    case "draft":
      return ok(
        call,
        {
          answer: CLAIMS.join("\n\n"),
          claims: CLAIMS.map((text) => ({ text, confidence: "high", sources: [] })),
          charts: DRAFT_CHARTS[seat],
          verdict: { kind: "fact", rating: "none" },
        },
        { sources: FOUND[seat], costUsd: 0.05 },
      );
    case "merge": {
      const claim = (i: number) => state.drafts.map((d) => d.claims[i] ?? "");
      return ok(call, {
        paragraphs: [
          { text: CLAIMS[0], claims: claim(0) },
          { text: CLAIMS[1], claims: claim(1) },
        ],
        conflicts: [],
      });
    }
    case "chart_merge": {
      const proposals = [
        ...call.prompt.matchAll(/^## Proposal (\w+)\n(?:.*\n){2}measure: (.*)$/gm),
      ];
      const rows = [...call.prompt.matchAll(/^- ([\w.]+): (.*)$/gm)].map((m) => ({
        row: m[1] ?? "",
        key: /enero/i.test(m[2] ?? "") ? "2026-01" : (m[2] ?? ""),
      }));
      const measures = [...new Set(proposals.map((m) => m[2] ?? ""))];
      const charts = measures
        .map((measure) => {
          const ids = proposals.filter((m) => m[2] === measure).map((m) => m[1] ?? "");
          return {
            question: measure.startsWith("Inflación")
              ? "¿Cuánto subieron los precios cada mes de 2026?"
              : `¿Cómo evolucionó la ${measure.toLowerCase()}?`,
            dimension: measure.startsWith("Inflación") ? "Mes" : "Trimestre",
            measure,
            briefs: ids,
            keys: rows.filter((r) => ids.some((id) => r.row.startsWith(`${id}.`))),
          };
        })
        .sort((a, b) => b.briefs.length - a.briefs.length);
      return ok(call, { charts });
    }
    case "chart_spec":
      return ok(
        call,
        n === "c1"
          ? {
              spec: WRITER_SPEC,
              title: "Inflación mensual de 2026",
              caption: "Según el INDEC.",
              after: "p1",
            }
          : {
              spec: JSON.stringify({
                mark: "bar",
                encoding: {
                  x: { field: "key", type: "nominal", title: "Trimestre" },
                  y: { field: "value", type: "quantitative", title: "Desocupación (%)" },
                },
              }),
              title: "Desocupación",
              caption: "Según la EPH del INDEC.",
              after: "p2",
            },
      );
    case "round1": {
      const R1: Record<ModelId, unknown> = {
        grok: {
          suggestions: [],
          patches: [
            patch(
              "c1",
              "encoding",
              "encoding.y.title",
              '"Inflación mensual (%)"',
              "El eje no dice que es mensual.",
            ),
            patch("c1", "caption", "", CAPTION, "Falta decir qué está en duda.", {
              kind: "missing",
            }),
          ],
          checks: [
            check("2026-03", "v2", "fails"),
            check("2026-04", "v1", "holds"),
            check("2026-05", "v2", "holds"),
          ],
        },
        claude: {
          suggestions: [],
          patches: [
            patch("c1", "encoding", "encoding.y.scale.scheme", '"reds"', "El rojo marca la suba."),
            patch(
              "c1",
              "transform",
              "",
              '[{"filter":"datum.nope > 0"}]',
              "Hay que sacar los meses sin dato.",
              { kind: "wrong" },
            ),
          ],
          checks: [
            check("2026-03", "v1", "holds"),
            check("2026-04", "v1", "holds"),
            check("2026-05", "v1", "holds"),
          ],
        },
        openai: {
          suggestions: [],
          patches: [
            patch("c1", "caption", "", CAPTION, "Hay que avisar qué meses están en duda.", {
              kind: "missing",
            }),
            patch(
              "c2",
              "title",
              "",
              "Desocupación trimestral (%)",
              "El título no dice el período.",
              {
                kind: "missing",
              },
            ),
          ],
          checks: [
            check("2026-03", "v2", "fails"),
            check("2026-04", "v1", "unclear"),
            check("2026-05", "v1", "holds"),
            check("2026-05", "v2", "holds"),
          ],
        },
        gemini: {
          suggestions: [
            {
              paragraph: "p2",
              op: "replace",
              kind: "missing",
              text: MARCH,
              reason: "Falta la cifra de marzo.",
              sources: [],
            },
          ],
          patches: [
            patch("c1", "data", "2026-02", "2.5", "Una consultora mide otra cifra para febrero.", {
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
    case "round2": {
      const none = { suggestions: [], patches: [] };
      const R2: Record<ModelId, unknown> = {
        grok: {
          ...none,
          votes: [vote("t3", "s3"), vote("t4", "s4")],
          checks: [check("2026-02", "v2", "fails")],
        },
        claude: {
          ...none,
          votes: [vote("t1", "s1"), vote("t2", "s2"), vote("t3", "s3"), vote("t4", "s4")],
          checks: [check("2026-02", "v2", "fails")],
        },
        openai: {
          ...none,
          votes: [vote("t1", "s1"), vote("t4", "s4")],
          checks: [check("2026-02", "v2", "fails")],
        },
        gemini: {
          ...none,
          votes: [vote("t1", "keep"), vote("t2", "keep")],
          checks: [check("2026-02", "v1", "holds")],
        },
      };
      return ok(call, R2[seat]);
    }
    case "round3":
      return ok(call, { votes: [], checks: [] });
    case "editor":
      return ok(call, {
        paragraphs: [{ id: "p1", text: "Durante 2026 la inflación mensual se moderó." }],
      });
    case "editor_check":
      return ok(call, { checks: [{ id: "p1", verdict: "same" }] });
    case "moments":
      return ok(call, { sentences: [`Momento ${n}.`] });
    default:
      return null;
  }
};
