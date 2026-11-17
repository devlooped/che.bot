// Test support for chart runs (phase 4), part of `@chebot/driver/testing`: scripted briefs, merge,
// spec and rounds, read from the prompts as a model would. Web data: monthly inflation, with a row
// typed from memory (dropped), a conflict that the sources settle, one that stays a range, a patch
// that does not render and one of the theme. User data: the briefs agree on a sum by region; the
// writer's spec carries data (refused); a data patch is refused; one patch of the encoding is
// accepted.
import type { ModelId } from "@chebot/protocol";
import type { FakeOutcome, GenerateRequest } from "@chebot/providers";

const found = (url: string, title: string, quote: string) => ({ url, title, quote });

const FOUND_WEB: Record<ModelId, { url: string; title: string; quote: string }[]> = {
  grok: [
    found("https://indec.gob.ar/ipc-enero", "INDEC enero", "La inflación de enero fue de 2,2%"),
    found("https://indec.gob.ar/ipc-marzo", "INDEC marzo", "marzo 3,1%"),
    found("https://consultora.example/mayo", "Consultora", "mayo 3,5%"),
  ],
  claude: [
    found("https://indec.gob.ar/ipc-enero", "INDEC enero", "La inflación de enero fue de 2,2%"),
    found("https://diario.example/marzo", "Diario", "en marzo el IPC subió 3%"),
    found("https://otra.example/mayo", "Otra", "mayo: 3,7%"),
  ],
  openai: [
    found("https://indec.gob.ar/ipc-enero", "INDEC enero", "La inflación de enero fue de 2,2%"),
    found("https://indec.gob.ar/ipc-marzo", "INDEC marzo", "marzo 3,1%"),
  ],
  gemini: [found("https://indec.gob.ar/ipc-enero", "INDEC", "La inflación de enero fue de 2,2%")],
};

const row = (key: string, value: string, source: string, quote: string) => ({
  key,
  value,
  source,
  quote,
});

const ROWS_WEB: Record<ModelId, ReturnType<typeof row>[]> = {
  grok: [
    row("2026-01", "2.2", "https://indec.gob.ar/ipc-enero", "enero fue de 2,2%"),
    row("2026-03", "3.1", "https://indec.gob.ar/ipc-marzo", "marzo 3,1%"),
    row("2026-05", "3.5", "https://consultora.example/mayo", "mayo 3,5%"),
  ],
  claude: [
    row("2026-01", "2.2", "https://indec.gob.ar/ipc-enero", "enero fue de 2,2%"),
    row("2026-03", "3.0", "https://diario.example/marzo", "subió 3%"),
    row("2026-05", "3.7", "https://otra.example/mayo", "mayo: 3,7%"),
    // typed from memory: the search of this call did not return the URL
    row("2026-06", "4.0", "https://typed.example/junio", "junio 4%"),
  ],
  openai: [
    row("2026-01", "2.2", "https://indec.gob.ar/ipc-enero", "2,2%"),
    row("2026-03", "3.1", "https://indec.gob.ar/ipc-marzo", "marzo 3,1%"),
  ],
  gemini: [row("Enero 2026", "2.2", "https://indec.gob.ar/ipc-enero", "enero fue de 2,2%")],
};

const patch = (
  layer: string,
  path: string,
  value: string,
  reason: string,
  kind = "misleading",
) => ({
  layer,
  path,
  value,
  kind,
  reason,
  sources: [] as string[],
  quote: "",
});

const check = (r: string, value: string, verdict: string) => ({
  row: r,
  value,
  verdict,
  reason: "La cita lo dice.",
});

const out = (output: unknown, extra: Partial<Extract<FakeOutcome, { output: unknown }>> = {}) =>
  ({
    output,
    usage: { inputTokens: 100, outputTokens: 50 },
    costUsd: 0.02,
    ...extra,
  }) as FakeOutcome;

const WEB_ROUND1: Record<ModelId, unknown> = {
  grok: {
    patches: [
      patch(
        "encoding",
        "encoding.y.title",
        '"Inflación mensual (%)"',
        "El eje no dice que es mensual.",
      ),
    ],
    checks: [check("2026-03", "v2", "fails"), check("2026-05", "v2", "holds")],
  },
  claude: {
    patches: [
      patch("encoding", "encoding.y.scale.scheme", '"reds"', "El rojo marca la suba."),
      patch(
        "transform",
        "",
        '[{"filter":"datum.nope > 0"}]',
        "Faltan los meses sin dato.",
        "wrong",
      ),
    ],
    checks: [check("2026-03", "v1", "holds"), check("2026-05", "v1", "holds")],
  },
  openai: {
    patches: [],
    checks: [
      check("2026-03", "v2", "fails"),
      check("2026-05", "v1", "holds"),
      check("2026-05", "v2", "holds"),
    ],
  },
  gemini: {
    patches: [],
    checks: [
      check("2026-03", "v1", "holds"),
      check("2026-05", "v1", "holds"),
      check("2026-05", "v2", "holds"),
    ],
  },
};

/** The scripted outcome of a call of a web chart run (a FakeScript `respond`). */
export function respondWebChart(req: GenerateRequest<unknown>): FakeOutcome {
  const [kind, n, seat] = req.callKey.split(":") as [string, string, ModelId];
  switch (kind) {
    case "brief":
      return out(
        {
          question: "¿Cuánto subieron los precios cada mes?",
          dimension: "Mes",
          measure: "Inflación mensual (%)",
          mark: "line",
          rows: ROWS_WEB[seat],
        },
        { sources: FOUND_WEB[seat], costUsd: 0.05 },
      );
    case "chart-merge":
      return out(
        {
          question: "¿Cuánto subieron los precios cada mes de 2026?",
          dimension: "Mes",
          measure: "Inflación mensual (%)",
          drafts: [...req.prompt.matchAll(/^## Draft (\w)$/gm)].map((m) => ({
            draft: m[1],
            measure: "same",
          })),
          keys: [...req.prompt.matchAll(/^- (\w+): (.*)$/gm)].map((m) => ({
            row: m[1],
            key: /enero/i.test(m[2] ?? "") ? "2026-01" : m[2],
          })),
        },
        { costUsd: 0.001 },
      );
    case "spec":
      return out({
        spec: JSON.stringify({
          mark: "line",
          encoding: {
            x: { field: "key", type: "temporal", title: "Mes" },
            y: {
              field: "value",
              type: "quantitative",
              title: "Inflación (%)",
              scale: { scheme: "reds" },
            },
          },
          config: { font: "Comic Sans MS" },
        }),
        title: "Inflación mensual de 2026",
        caption: "Según el INDEC.",
      });
    case "round": {
      if (n === "1") return out(WEB_ROUND1[seat]);
      const votes =
        seat === "grok"
          ? []
          : [{ thread: "t1", choice: seat === "gemini" ? "keep" : "s1", reason: "" }];
      return out(n === "2" ? { votes, patches: [], checks: [] } : { votes: [], checks: [] });
    }
    case "moments":
      return out({ sentences: ["Los cuatro están armando el gráfico."] }, { costUsd: 0.001 });
    default:
      return { kind: "error", message: `unscripted ${req.callKey}` };
  }
}

export const SALES_CSV = [
  "region;mes;ventas",
  "Norte;2026-01;100",
  "Norte;2026-02;150",
  "Sur;2026-01;80",
  'Sur;2026-02;"95,5"',
  "Oeste;2026-01;40",
].join("\n");

const SUM_BY_REGION = JSON.stringify([
  { aggregate: [{ op: "sum", field: "ventas", as: "total" }], groupby: ["region"] },
]);

/** The scripted outcome of a call of a chart run on SALES_CSV (a FakeScript `respond`). */
export function respondUserChart(req: GenerateRequest<unknown>): FakeOutcome {
  const [kind, n, seat] = req.callKey.split(":") as [string, string, ModelId];
  switch (kind) {
    case "brief":
      return out({
        question: "¿Cuánto vendió cada región?",
        dimension: "region",
        measures: ["ventas"],
        mark: "bar",
        transform: SUM_BY_REGION,
      });
    case "spec":
      // the writer types the data: refused, the plain chart of code is used
      return out({
        spec: JSON.stringify({
          data: { values: [{ region: "Norte", total: 1000 }] },
          mark: "bar",
          encoding: {},
        }),
        title: "Ventas por región",
        caption: "El Norte vende más.",
      });
    case "round":
      if (n === "1") {
        if (seat === "openai")
          return out({
            patches: [
              patch(
                "encoding",
                "encoding.y",
                '{"field":"total","type":"quantitative","title":"Ventas totales"}',
                "El eje no dice que es la suma.",
              ),
            ],
            checks: [],
          });
        if (seat === "grok")
          return out({
            patches: [patch("data", "r1", "1000", "El Norte vendió más.", "wrong")],
            checks: [],
          });
        return out({ patches: [], checks: [] });
      }
      return out({
        votes:
          seat === "openai"
            ? []
            : [{ thread: "t1", choice: seat === "gemini" ? "keep" : "s1", reason: "" }],
        patches: [],
        checks: [],
      });
    case "moments":
      return out({ sentences: ["Los cuatro miran tus datos."] });
    default:
      return { kind: "error", message: `unscripted ${req.callKey}` };
  }
}
