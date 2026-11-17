// The local mode only: the scripted panel of CHART_QUESTION, whose answer has two charts among its
// paragraphs, played through the real protocol and the real renderer. Every other question gets the
// prose of scenario.ts, whose drafts propose no chart. It has every state of the chart view:
// - c1, monthly inflation of the first half of 2025, proposed by the four drafts. January, February
//   and April agreed; March disputed (two models cite a news estimate, one the statistics office) and
//   settled by the source, so its value changes; May disputed and left as a range (neither source
//   holds up); June from one model only, whose source the others do not find stating it. Round 1
//   proposes a title, a caption and bars instead of lines; round 2 accepts the title and the
//   caption, and the bars end two against two (a dissent note: round 2 brings nothing new, so the
//   rounds end there).
// - c2, monthly growth of registered wages, proposed by Grok and ChatGPT alike: every row agreed.
// - Claude proposes a chart of the dollar that nobody else makes: it is declined.
import type { ModelId } from "@chebot/protocol";
import type { FakeOutcome, FoundSource, GenerateRequest } from "@chebot/providers";

const INDEC = "https://www.indec.gob.ar/uploads/informesdeprensa";

const src = (url: string, title: string, quote: string): FoundSource => ({ url, title, quote });

const ENE = src(
  `${INDEC}/ipc_01_25.pdf`,
  "Índice de precios al consumidor, enero de 2025 (INDEC)",
  "En enero de 2025 el IPC registró una variación de 2,2% respecto de diciembre.",
);
const FEB = src(
  `${INDEC}/ipc_02_25.pdf`,
  "Índice de precios al consumidor, febrero de 2025 (INDEC)",
  "En febrero el nivel general del IPC subió 2,4% respecto del mes anterior.",
);
const MAR = src(
  `${INDEC}/ipc_03_25.pdf`,
  "Índice de precios al consumidor, marzo de 2025 (INDEC)",
  "En marzo de 2025 el nivel general del índice de precios al consumidor registró una suba de 3,7%.",
);
const MAR_DIARIO = src(
  "https://www.ambito.com/economia/inflacion-marzo-2025",
  "Las consultoras anticipan la inflación de marzo (Ámbito)",
  "Las consultoras privadas estiman que la inflación de marzo habría sido de 3,3%.",
);
const ABR = src(
  `${INDEC}/ipc_04_25.pdf`,
  "Índice de precios al consumidor, abril de 2025 (INDEC)",
  "En abril el IPC mostró una variación mensual de 2,8%.",
);
const MAY_CABA = src(
  "https://www.estadisticaciudad.gob.ar/eyc/?p=ipcba-mayo-2025",
  "Índice de precios al consumidor de la Ciudad de Buenos Aires, mayo de 2025",
  "En mayo de 2025 el IPCBA registró un alza de 1,5%.",
);
const MAY_CONSULTORA = src(
  "https://www.ecolatina.com/informes/precios-mayo-2025",
  "Relevamiento de precios minoristas, mayo de 2025 (Ecolatina)",
  "Nuestro relevamiento de precios minoristas de mayo arrojó una suba de 1,9%.",
);
const JUN_REM = src(
  "https://www.bcra.gob.ar/PublicacionesEstadisticas/Relevamiento_Expectativas_de_Mercado.asp",
  "Relevamiento de Expectativas de Mercado (BCRA)",
  "Los analistas que participan del REM esperan para junio una inflación de 1,6%.",
);

const RIPTE = src(
  "https://www.argentina.gob.ar/trabajo/seguridadsocial/ripte",
  "Remuneración imponible promedio de los trabajadores estables (RIPTE)",
  "El RIPTE subió 2,0% en enero, 2,1% en febrero y 2,9% en marzo de 2025.",
);
const DOLAR = src(
  "https://www.bcra.gob.ar/PublicacionesEstadisticas/Tipo_de_cambio",
  "Tipo de cambio de referencia (BCRA)",
  "El tipo de cambio de referencia subió 1,1% en enero de 2025.",
);

const FOUND: Record<ModelId, FoundSource[]> = {
  grok: [ENE, FEB, MAR, ABR, MAY_CONSULTORA, RIPTE],
  claude: [ENE, FEB, MAR_DIARIO, MAY_CABA, DOLAR],
  openai: [ENE, FEB, MAR_DIARIO, ABR, RIPTE],
  gemini: [ENE, JUN_REM],
};

const row = (key: string, value: string, s: FoundSource) => ({
  key,
  value,
  source: s.url,
  quote: s.quote,
});

const ROWS: Record<ModelId, ReturnType<typeof row>[]> = {
  grok: [
    row("2025-01", "2.2", ENE),
    row("2025-02", "2.4", FEB),
    row("2025-03", "3.7", MAR),
    row("2025-04", "2.8", ABR),
    row("2025-05", "1.9", MAY_CONSULTORA),
  ],
  claude: [
    row("2025-01", "2.2", ENE),
    row("2025-02", "2.4", FEB),
    row("2025-03", "3.3", MAR_DIARIO),
    row("2025-05", "1.5", MAY_CABA),
  ],
  openai: [
    row("2025-01", "2.2", ENE),
    row("2025-02", "2.4", FEB),
    row("2025-03", "3.3", MAR_DIARIO),
    row("2025-04", "2.8", ABR),
  ],
  gemini: [row("Enero de 2025", "2.2", ENE), row("2025-06", "1.6", JUN_REM)],
};

const WAGES = [
  row("2025-01", "2.0", RIPTE),
  row("2025-02", "2.1", RIPTE),
  row("2025-03", "2.9", RIPTE),
];

const brief = (
  measure: string,
  dimension: string,
  mark: string,
  rows: ReturnType<typeof row>[],
) => ({
  question: `¿Cómo varió cada mes: ${measure.toLowerCase()}?`,
  dimension,
  measure,
  mark,
  rows,
});

/** The charts each draft proposes. */
const CHARTS: Record<ModelId, ReturnType<typeof brief>[]> = {
  grok: [
    brief("Inflación mensual (%)", "Mes", "line", ROWS.grok),
    brief("Variación del salario registrado (%)", "Mes", "bar", WAGES),
  ],
  claude: [
    brief("Inflación mensual (%)", "Mes", "line", ROWS.claude),
    brief("Variación del dólar oficial (%)", "Mes", "line", [row("2025-01", "1.1", DOLAR)]),
  ],
  openai: [
    brief("Inflación mensual (%)", "Mes", "line", ROWS.openai),
    brief("Variación del salario registrado (%)", "Mes", "bar", WAGES),
  ],
  gemini: [brief("Inflación mensual (%)", "Mes", "line", ROWS.gemini)],
};

/** The text every draft writes: the figures are in the charts. */
const CLAIMS = [
  "En el primer semestre de 2025 la inflación mensual bajó: pasó de más de 3 % en marzo a menos de 2 % en mayo y junio.",
  "En el primer trimestre los salarios registrados subieron a un ritmo parecido al de los precios.",
];

/** What each model says of each value it checks, by row and value (the value as the prompt writes it). */
const CHECKS: Record<ModelId, Record<string, Record<string, [string, string]>>> = {
  grok: {
    "2025-03": { "3.3": ["fails", "Es una estimación privada, no el dato medido."] },
    "2025-05": { "1.5": ["fails", "Es el índice de la Ciudad, no el del país."] },
    "2025-06": { "1.6": ["fails", "Es lo que esperan los analistas, no lo que pasó."] },
  },
  claude: {
    "2025-03": { "3.7": ["holds", "El informe del INDEC dice 3,7% para marzo."] },
    "2025-05": { "1.9": ["fails", "Es el relevamiento de una consultora, no el índice."] },
    "2025-06": { "1.6": ["fails", "Es una expectativa del mercado, no el dato de junio."] },
  },
  openai: {
    "2025-03": { "3.7": ["holds", "La cita del INDEC dice 3,7%."] },
    "2025-05": {
      "1.9": ["holds", "La cita dice 1,9% para mayo."],
      "1.5": ["holds", "La cita dice 1,5% para mayo."],
    },
    "2025-06": { "1.6": ["fails", "La cita es una expectativa."] },
  },
  gemini: {
    "2025-03": {
      "3.7": ["holds", "Es el dato oficial."],
      "3.3": ["fails", "La nota habla de una estimación."],
    },
    "2025-05": {
      "1.9": ["unclear", "No sé si el relevamiento mide lo mismo."],
      "1.5": ["fails", "Es solo la Ciudad de Buenos Aires."],
    },
  },
};

const patch = (
  layer: string,
  path: string,
  value: string,
  reason: string,
  kind = "misleading",
) => ({
  chart: "c1",
  layer,
  path,
  value,
  kind,
  reason,
  sources: [] as string[],
  quote: "",
});

const vote = (thread: string, choice: string, reason = "") => ({ thread, choice, reason });

/** The title, the caption and the bars that round 1 proposes (t1, t2 and t3, in model order). */
const WEB_ROUND1: Record<ModelId, unknown[]> = {
  grok: [],
  claude: [
    patch(
      "title",
      "",
      "Inflación mensual en la Argentina, enero a junio de 2025",
      "El título no dice el país ni el año.",
      "missing",
    ),
  ],
  openai: [
    patch(
      "caption",
      "",
      "La inflación mensual de la Argentina según el INDEC. En mayo las fuentes no coinciden y se muestra el rango; el dato de junio es una expectativa de mercado que nadie pudo confirmar.",
      "La explicación tiene que decir qué datos están en duda.",
      "missing",
    ),
  ],
  gemini: [
    patch(
      "encoding",
      "mark",
      '"bar"',
      "Con barras se comparan mejor los meses entre sí.",
      "misleading",
    ),
  ],
};

const WEB_ROUND2: Record<ModelId, unknown[]> = {
  grok: [vote("t1", "s1"), vote("t2", "s2"), vote("t3", "keep")],
  claude: [vote("t2", "s2"), vote("t3", "s3", "Con barras cada mes se lee solo, sin unir puntos.")],
  openai: [vote("t1", "s1"), vote("t3", "keep", "Es una serie de meses: la línea es lo natural.")],
  gemini: [vote("t1", "s1"), vote("t2", "keep")],
};

/** The value ids of the rows to check in a round prompt, leaving out the model's own: chart and row → value → id. */
function valueIds(prompt: string): Map<string, Map<string, string>> {
  const out = new Map<string, Map<string, string>>();
  for (const block of prompt.split(/^### chart /m).slice(1)) {
    const head = /^(c\d+), row (.*)$/m.exec(block);
    if (!head) continue;
    const ids = new Map<string, string>();
    for (const m of block.matchAll(/^- (v\d+): ([-\d.]+)(.*)$/gm))
      if (!(m[3] ?? "").startsWith(" (yours")) ids.set(m[2] ?? "", m[1] ?? "");
    out.set(`${head[1]}|${(head[2] ?? "").trim()}`, ids);
  }
  return out;
}

function checksOf(model: ModelId, prompt: string) {
  const checks: { chart: string; row: string; value: string; verdict: string; reason: string }[] =
    [];
  for (const [at, ids] of valueIds(prompt)) {
    const [chart = "", rowKey = ""] = at.split("|");
    for (const [value, id] of ids) {
      const said = CHECKS[model][rowKey]?.[value];
      if (said) checks.push({ chart, row: rowKey, value: id, verdict: said[0], reason: said[1] });
    }
  }
  return checks;
}

/** Plain moments of the run with charts for the facts the reducer passes. */
function chartMoments(prompt: string): string[] {
  const out: string[] = [];
  const said = (text: string) => {
    if (!out.includes(text) && out.length < 3) out.push(text);
  };
  if (/finished its own answer/.test(prompt))
    said("Cada uno respondió por su cuenta y buscó los números, con la fuente de cada uno.");
  if (/proposed a chart of Variación del dólar/.test(prompt))
    said("Claude propuso un gráfico del dólar, pero nadie más lo armó: queda afuera.");
  if (/merged into a chart of Inflación/.test(prompt))
    said(
      "La respuesta suma dos gráficos: en el de inflación tres meses no coinciden y hay que revisar las fuentes.",
    );
  if (/settled the value of 2025-03/.test(prompt))
    said("El INDEC confirmó el dato de marzo: fue 3,7 %, no 3,3 % como decía una nota.");
  if (/sources of 2025-05 disagree/.test(prompt))
    said("En mayo las fuentes no coinciden: el gráfico muestra las dos cifras como un rango.");
  if (/only source of 2025-06/.test(prompt))
    said("El dato de junio lo trajo solo Gemini y nadie pudo confirmarlo con su fuente.");
  if (/was accepted/.test(prompt) && /Claude/.test(prompt))
    said("Se aceptó el título que propuso Claude.");
  if (/was accepted/.test(prompt) && /ChatGPT/.test(prompt))
    said("Se aceptó la explicación de ChatGPT, que avisa qué datos están en duda.");
  if (/no agreement/.test(prompt))
    said("Gemini quería barras en vez de una línea; no hubo acuerdo y queda anotado.");
  return out;
}

/** Whether a call belongs to the run of CHART_QUESTION (the e2e tests add a suffix to it). */
export function isChartQuestion(prompt: string): boolean {
  return prompt.includes(CHART_QUESTION);
}

/**
 * The scripted outcome of a call of the run of CHART_QUESTION, or null when the call is not of it
 * (the prose script answers it). `out` wraps an output with the usage, cost and delay of the call.
 */
export function respondChart(
  req: GenerateRequest<unknown>,
  out: (output: unknown, extra?: { sources?: FoundSource[]; costUsd?: number }) => FakeOutcome,
): FakeOutcome | null {
  if (!isChartQuestion(req.prompt)) return null;
  const [kind = "", n, seatRaw] = req.callKey.split(":");
  const seat = seatRaw as ModelId;
  switch (kind) {
    case "draft":
      return out(
        {
          answer: CLAIMS.join("\n\n"),
          claims: CLAIMS.map((text) => ({ text, confidence: "high", sources: [] })),
          charts: CHARTS[seat],
        },
        { sources: FOUND[seat], costUsd: 0.05 },
      );
    case "merge": {
      const ids = [...req.prompt.matchAll(/^- (\w+) \[\w+\] (.*)$/gm)];
      return out({
        paragraphs: CLAIMS.map((text) => ({
          text,
          claims: ids.filter((m) => m[2] === text).map((m) => m[1] ?? ""),
        })),
        conflicts: [],
      });
    }
    case "chart-merge": {
      const proposals = [...req.prompt.matchAll(/^## Proposal (\w+)\n(?:.*\n){2}measure: (.*)$/gm)];
      const rows = [...req.prompt.matchAll(/^- ([\w.]+): (.*)$/gm)];
      const measures = [...new Set(proposals.map((m) => m[2] ?? ""))];
      return out(
        {
          charts: measures
            .map((measure) => {
              const ids = proposals.filter((m) => m[2] === measure).map((m) => m[1] ?? "");
              return {
                question: measure.startsWith("Inflación")
                  ? "¿Cuánto subieron los precios cada mes del primer semestre de 2025?"
                  : `¿Cuánto varió cada mes: ${measure.toLowerCase()}?`,
                dimension: "Mes",
                measure,
                briefs: ids,
                keys: rows
                  .filter((m) => ids.some((id) => (m[1] ?? "").startsWith(`${id}.`)))
                  .map((m) => ({
                    row: m[1] ?? "",
                    key: /enero/i.test(m[2] ?? "") ? "2025-01" : (m[2] ?? ""),
                  })),
              };
            })
            .sort((a, b) => b.briefs.length - a.briefs.length),
        },
        { costUsd: 0.001 },
      );
    }
    case "spec":
      return out(
        n === "c1"
          ? {
              spec: JSON.stringify({
                mark: "line",
                encoding: {
                  x: { field: "key", type: "temporal", title: "Mes", timeUnit: "yearmonth" },
                  y: { field: "value", type: "quantitative", title: "Inflación mensual (%)" },
                },
              }),
              title: "Inflación mensual de 2025",
              caption: "La inflación de cada mes según el INDEC.",
              after: "p1",
            }
          : {
              spec: JSON.stringify({
                mark: "bar",
                encoding: {
                  x: { field: "key", type: "ordinal", title: "Mes" },
                  y: { field: "value", type: "quantitative", title: "Variación mensual (%)" },
                },
              }),
              title: "Salario registrado: variación mensual",
              caption:
                "La variación de cada mes del RIPTE, el salario promedio de los trabajadores estables.",
              after: "p2",
            },
      );
    case "round": {
      const checks = checksOf(seat, req.prompt);
      if (n === "1") return out({ suggestions: [], patches: WEB_ROUND1[seat], checks });
      if (n === "2") return out({ votes: WEB_ROUND2[seat], suggestions: [], patches: [], checks });
      return out({ votes: [], checks });
    }
    case "moments":
      return out({ sentences: chartMoments(req.prompt) });
    default:
      return null;
  }
}

/** The question whose answer has charts. */
export const CHART_QUESTION =
  "¿Cuánto fue la inflación de cada mes del primer semestre de 2025, y cómo le fue al salario?";
