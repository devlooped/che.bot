// The local mode only: the scripted panel of a chart run (step 41), played through the real
// protocol and the real renderer whatever the question, when the run is asked for a chart. It has
// every state of the chart view:
// - web data: monthly inflation of the first half of 2025. January, February and April agreed;
//   March disputed (two models cite a news estimate, one the statistics office) and settled by the
//   source, so its value changes; May disputed and left as a range (neither source holds up); June
//   from one model only, whose source the others do not find stating it. Round 1 proposes a title,
//   a caption and bars instead of lines; round 2 accepts the title and the caption, and the bars end
//   two against two (a dissent note: round 2 brings nothing new, so the rounds end there).
// - user data: any CSV. The briefs read the columns from the prompt: three sum the first number
//   column by the first text column, Gemini averages it. Round 1 proposes an axis title, a caption
//   and the average; round 2 accepts the first two and rejects the average.
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

const FOUND: Record<ModelId, FoundSource[]> = {
  grok: [ENE, FEB, MAR, ABR, MAY_CONSULTORA],
  claude: [ENE, FEB, MAR_DIARIO, MAY_CABA],
  openai: [ENE, FEB, MAR_DIARIO, ABR],
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

/** The columns of an upload, as the prompts list them ("- ventas (number): 6 values; ..."). */
function columnsOf(prompt: string): { name: string; type: string }[] {
  return [...prompt.matchAll(/^- (.+?) \((number|date|text)\): /gm)].map((m) => ({
    name: m[1] ?? "",
    type: m[2] ?? "",
  }));
}

/** The plan of every brief for an upload: a measure summed (or averaged) by a dimension. */
function planOf(prompt: string, op: "sum" | "mean") {
  const columns = columnsOf(prompt);
  const measure = columns.find((c) => c.type === "number")?.name ?? columns[0]?.name ?? "";
  const dimension =
    columns.find((c) => c.type === "text")?.name ??
    columns.find((c) => c.type === "date")?.name ??
    columns.find((c) => c.name !== measure)?.name ??
    measure;
  const as = op === "sum" ? "total" : "promedio";
  return {
    measure,
    dimension,
    as,
    transform: JSON.stringify([{ aggregate: [{ op, field: measure, as }], groupby: [dimension] }]),
  };
}

/** The value ids of the rows to check in a round prompt, leaving out the model's own: row → value → id. */
function valueIds(prompt: string): Map<string, Map<string, string>> {
  const out = new Map<string, Map<string, string>>();
  for (const block of prompt.split(/^### row /m).slice(1)) {
    const ids = new Map<string, string>();
    for (const m of block.matchAll(/^- (v\d+): ([-\d.]+)(.*)$/gm))
      if (!(m[3] ?? "").startsWith(" (yours")) ids.set(m[2] ?? "", m[1] ?? "");
    out.set(block.slice(0, block.indexOf("\n")).trim(), ids);
  }
  return out;
}

function checksOf(model: ModelId, prompt: string) {
  const checks: { row: string; value: string; verdict: string; reason: string }[] = [];
  for (const [rowKey, ids] of valueIds(prompt)) {
    for (const [value, id] of ids) {
      const said = CHECKS[model][rowKey]?.[value];
      if (said) checks.push({ row: rowKey, value: id, verdict: said[0], reason: said[1] });
    }
  }
  return checks;
}

/** The chart runs of this isolate by question, and whether each charts an upload: the moments call says only the question. */
const chartQuestions = new Map<string, boolean>();

function questionOf(prompt: string): string {
  return (/^Question:\s*([\s\S]*?)(?:\n\n|$)/.exec(prompt)?.[1] ?? "").trim();
}

/** Plain moments of a chart run for the facts the reducer passes; none for the rest. */
function chartMoments(prompt: string, upload: boolean): string[] {
  const out: string[] = [];
  const said = (text: string) => {
    if (!out.includes(text) && out.length < 3) out.push(text);
  };
  if (upload) {
    if (/prepared the data of the chart alone/.test(prompt))
      said("Cada uno pensó por su cuenta cómo graficar tu tabla, sin ver los números.");
    if (/merged into one chart/.test(prompt))
      said("Juntamos los planes de los cuatro en un solo gráfico de tus datos.");
    if (/was accepted/.test(prompt))
      said("Se aceptaron el nombre del eje que propuso Grok y la explicación de ChatGPT.");
    if (/found no support/.test(prompt))
      said("Gemini quería el promedio en vez de la suma; nadie más lo apoyó.");
    return out;
  }
  if (/prepared the data of the chart alone/.test(prompt))
    said("Cada uno buscó los datos por su cuenta, con la fuente de cada número.");
  if (/merged into one chart/.test(prompt))
    said(
      "Juntamos los datos en un gráfico: en tres meses no coinciden y hay que revisar las fuentes.",
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

/**
 * The scripted outcome of a call of a chart run, or null when the call is not one (the prose
 * script answers it). `out` wraps an output with the usage, cost and delay of the call.
 */
export function respondChart(
  req: GenerateRequest<unknown>,
  out: (output: unknown, extra?: { sources?: FoundSource[]; costUsd?: number }) => FakeOutcome,
): FakeOutcome | null {
  const [kind = "", n, seatRaw] = req.callKey.split(":");
  const seat = seatRaw as ModelId;
  const upload = /uploaded data/i.test(req.prompt) || /uploaded data/i.test(req.system);
  switch (kind) {
    case "brief": {
      chartQuestions.set(questionOf(req.prompt), upload);
      if (upload) {
        const plan = planOf(req.prompt, seat === "gemini" ? "mean" : "sum");
        return out({
          question: `¿Cuánto suma ${plan.measure} en cada ${plan.dimension}?`,
          dimension: plan.dimension,
          measures: [plan.as],
          mark: "bar",
          transform: plan.transform,
        });
      }
      return out(
        {
          question: "¿Cuánto subieron los precios cada mes de 2025?",
          dimension: "Mes",
          measure: "Inflación mensual (%)",
          mark: "line",
          rows: ROWS[seat],
        },
        { sources: FOUND[seat], costUsd: 0.05 },
      );
    }
    case "chart-merge":
      return out(
        {
          question: "¿Cuánto subieron los precios cada mes del primer semestre de 2025?",
          dimension: "Mes",
          measure: "Inflación mensual (%)",
          drafts: [...req.prompt.matchAll(/^## Draft (\w)$/gm)].map((m) => ({
            draft: m[1],
            measure: "same",
          })),
          keys: [...req.prompt.matchAll(/^- (\w+): (.*)$/gm)].map((m) => ({
            row: m[1],
            key: /enero/i.test(m[2] ?? "") ? "2025-01" : m[2],
          })),
        },
        { costUsd: 0.001 },
      );
    case "spec": {
      if (upload) {
        const plan = planOf(req.prompt, "sum");
        return out({
          spec: JSON.stringify({
            mark: "bar",
            encoding: {
              x: { field: plan.dimension, type: "nominal", sort: "-y", title: plan.dimension },
              y: { field: "total", type: "quantitative", title: `Total de ${plan.measure}` },
            },
          }),
          title: `${plan.measure.charAt(0).toUpperCase()}${plan.measure.slice(1)} por ${plan.dimension}`,
          caption: `La suma de ${plan.measure} de cada ${plan.dimension}, calculada con tu tabla.`,
        });
      }
      return out({
        spec: JSON.stringify({
          mark: "line",
          encoding: {
            x: { field: "key", type: "temporal", title: "Mes", timeUnit: "yearmonth" },
            y: { field: "value", type: "quantitative", title: "Inflación mensual (%)" },
          },
        }),
        title: "Inflación mensual de 2025",
        caption: "La inflación de cada mes según el INDEC.",
      });
    }
    case "round": {
      if (!/shared chart/.test(req.system)) return null;
      if (upload) {
        const plan = planOf(req.prompt, "mean");
        if (n === "1") {
          const R1: Record<ModelId, unknown[]> = {
            grok: [
              patch(
                "encoding",
                "encoding.y.title",
                `"Suma de ${plan.measure}"`,
                "El eje tiene que decir que es una suma.",
              ),
            ],
            claude: [],
            openai: [
              patch(
                "caption",
                "",
                `Cada barra es la suma de ${plan.measure} de una ${plan.dimension}, calculada con todas las filas de tu tabla.`,
                "La explicación tiene que decir cómo se calculó cada barra.",
                "missing",
              ),
            ],
            gemini: [
              patch(
                "transform",
                "",
                JSON.stringify([
                  {
                    aggregate: [{ op: "mean", field: plan.measure, as: "total" }],
                    groupby: [plan.dimension],
                  },
                ]),
                "Con el promedio no pesa cuántas filas tiene cada una.",
                "misleading",
              ),
            ],
          };
          return out({ patches: R1[seat], checks: [] });
        }
        const R2: Record<ModelId, unknown[]> = {
          grok: [
            vote("t2", "s2"),
            vote("t3", "keep", "La pregunta es cuánto suma, no el promedio."),
          ],
          claude: [vote("t1", "s1"), vote("t2", "s2"), vote("t3", "keep")],
          openai: [vote("t1", "s1"), vote("t3", "keep")],
          gemini: [vote("t1", "s1"), vote("t2", "s2")],
        };
        return out(
          n === "2" ? { votes: R2[seat], patches: [], checks: [] } : { votes: [], checks: [] },
        );
      }
      const checks = checksOf(seat, req.prompt);
      if (n === "1") return out({ patches: WEB_ROUND1[seat], checks });
      if (n === "2") return out({ votes: WEB_ROUND2[seat], patches: [], checks });
      return out({ votes: [], checks });
    }
    case "moments": {
      const chart = chartQuestions.get(questionOf(req.prompt));
      if (chart === undefined) return null;
      return out({ sentences: chartMoments(req.prompt, chart) });
    }
    default:
      return null;
  }
}

/** A question for the chart of web data (the e2e tests ask it with "Quiero un gráfico"). */
export const CHART_QUESTION = "¿Cuánto fue la inflación de cada mes del primer semestre de 2025?";

/** A question for the chart of an upload, and an upload for it (the e2e tests choose it as a file). */
export const UPLOAD_QUESTION = "¿Cuánto vendió cada sucursal en el primer trimestre?";

export const SAMPLE_CSV = [
  "sucursal;mes;ventas",
  "Centro;2025-01;1520000",
  "Centro;2025-02;1384500",
  "Centro;2025-03;1610250",
  "Palermo;2025-01;1104000",
  "Palermo;2025-02;1187300",
  "Palermo;2025-03;1250900",
  "Belgrano;2025-01;845600",
  "Belgrano;2025-02;902100",
  "Belgrano;2025-03;931400",
  "Caballito;2025-01;712800",
  "Caballito;2025-02;698450",
  "Caballito;2025-03;760300",
].join("\n");
