// The local mode only (never imported by the production entry): a scripted panel that plays one
// realistic run in Spanish through the real protocol, whatever the question. It has every case
// the interface shows: four drafts with sources, a merged document with agreed, majority and
// contested paragraphs, suggestions in two rounds, two alternatives in one discussion, votes with
// a changed position, an accepted change and one left without agreement, a model that does not
// answer in the last round, the editor's pass, and moments phrased by the utility model.
//
// A marker in the question plays the states around that run (see MARKERS). A run asked for a chart
// plays the scripted chart run of chart-scenario.ts instead.
import type { ModelId } from "@chebot/protocol";
import type { FakeOutcome, FakeScript, FoundSource, GenerateRequest } from "@chebot/providers";
import { respondChart } from "./chart-scenario.ts";

/**
 * Markers that, written anywhere in a question, change how the scripted run goes:
 * - `fail`: no model answers the drafts, so the run fails; the first time only, per question and
 *   per model, so that the free rerun of a paid run plays the full run.
 * - `fewDrafts`: Grok and Gemini do not answer the drafts: two answers, no discussion.
 * - `budget`: the drafts cost so much that the budget ends before the rounds.
 */
export const MARKERS = {
  fail: "[falla]",
  fewDrafts: "[pocas]",
  budget: "[presupuesto]",
} as const;

/** The models whose first draft already failed, per question (the `fail` marker): this isolate. */
const failedOnce = new Set<string>();

/** The question the scripted run answers best (the e2e tests ask it). */
export const SCENARIO_QUESTION =
  "¿Cuánta agua hace falta para producir un kilo de carne vacuna? Leí que son 15.000 litros y me parece una exageración.";

const WFN: FoundSource = {
  url: "https://www.waterfootprint.org/resources/Report-48-WaterFootprint-AnimalProducts-Vol1.pdf",
  title: "The green, blue and grey water footprint of farm animals (Mekonnen y Hoekstra, 2010)",
  quote: "The average water footprint of beef is 15,400 litres per kilogram.",
};
const FAO: FoundSource = {
  url: "https://www.fao.org/4/a0701e/a0701e00.htm",
  title: "Livestock's long shadow (FAO, 2006)",
  quote: "Most of the water used by livestock is rain water that falls on grazing land.",
};
const INTA: FoundSource = {
  url: "https://www.argentina.gob.ar/inta",
  title: "Huella hídrica de la carne bovina en sistemas pastoriles (INTA)",
  quote: "En sistemas pastoriles de la región pampeana el agua azul es menos del 5 % del total.",
};
const FEEDLOT: FoundSource = {
  url: "https://www.sciencedirect.com/journal/agricultural-water-management",
  title: "Blue water use of feedlot beef (Agricultural Water Management)",
  quote: "Blue water use ranged from 550 to 1,800 litres per kilogram of carcass weight.",
};

/** The claims of each draft, in order; the merge recognizes them by their text. */
const CLAIMS = {
  grok: [
    {
      text: "La cifra más citada es de unos 15.400 litros de agua por kilo de carne vacuna, como promedio mundial.",
      sources: [WFN.url],
    },
    {
      text: "Más del 90 % de esa agua es lluvia que usan los pastos y los cultivos de forraje.",
      sources: [WFN.url],
    },
    {
      text: "En el pastoreo de la región pampeana casi no se usa agua de riego.",
      sources: [INTA.url],
    },
  ],
  claude: [
    {
      text: "El promedio mundial estimado es de unos 15.000 litros por kilo de carne.",
      sources: [WFN.url],
    },
    {
      text: "La mayor parte es agua de lluvia que igual cae sobre los campos.",
      sources: [FAO.url],
    },
    {
      text: "El agua que se saca de ríos y napas ronda los 550 litros por kilo.",
      sources: [WFN.url],
    },
  ],
  openai: [
    {
      text: "Se suelen citar unos 15.400 litros por kilo como promedio mundial.",
      sources: [WFN.url],
    },
    { text: "Cerca del 94 % de ese total es agua de lluvia.", sources: [WFN.url] },
    {
      text: "La cifra cambia mucho según el sistema: los feedlots usan más agua de riego por los granos.",
      sources: [],
    },
  ],
  gemini: [
    {
      text: "Más del 90 % del total es agua de lluvia que absorben los pastos.",
      sources: [FAO.url],
    },
    {
      text: "Si se cuenta solo el agua de riego y de bebida, son entre 550 y 1.800 litros por kilo.",
      sources: [FEEDLOT.url],
    },
    {
      text: "La cifra de 15.400 litros exagera el impacto, porque la lluvia no se gasta.",
      sources: [],
    },
    { text: "El número depende del sistema de producción y de la región.", sources: [INTA.url] },
  ],
} satisfies Record<ModelId, { text: string; sources: string[] }[]>;

const FOUND: Record<ModelId, FoundSource[]> = {
  grok: [WFN, INTA],
  claude: [WFN, FAO],
  openai: [WFN],
  gemini: [FAO, FEEDLOT, INTA],
};

const ANSWERS: Record<ModelId, string> = {
  grok: "Unos 15.400 litros por kilo es el promedio mundial más citado, pero más del 90 % es lluvia.\n\nEn el pastoreo pampeano casi no hay riego.",
  claude:
    "El promedio mundial ronda los 15.000 litros por kilo, aunque la mayor parte es agua de lluvia.\n\nEl agua que se saca de ríos y napas son unos 550 litros.",
  openai:
    "Se citan unos 15.400 litros por kilo; cerca del 94 % es lluvia.\n\nDepende mucho del sistema: los feedlots usan más riego.",
  gemini:
    "La mayor parte es lluvia. Contando solo riego y bebida, son entre 550 y 1.800 litros.\n\nLos 15.400 litros exageran, porque la lluvia no se gasta. Depende del sistema y de la región.",
};

/** The merged document: paragraphs by the claims they carry (model and index in CLAIMS). */
const MERGE: { text: string; claims: [ModelId, number][] }[] = [
  {
    // majority: Grok, Claude, ChatGPT
    text: "La cifra más citada es de unos 15.400 litros de agua por kilo de carne vacuna, como promedio mundial.",
    claims: [
      ["grok", 0],
      ["claude", 0],
      ["openai", 0],
    ],
  },
  {
    // agreed: the four
    text: "Más del 90 % de esa agua es lluvia que usan los pastos y los cultivos de forraje.",
    claims: [
      ["grok", 1],
      ["claude", 1],
      ["openai", 1],
      ["gemini", 0],
    ],
  },
  {
    // contested: Claude and Gemini
    text: "El agua que se saca de ríos y napas para riego y bebida va de 550 a 1.800 litros por kilo.",
    claims: [
      ["claude", 2],
      ["gemini", 1],
    ],
  },
  {
    // contested: Gemini alone
    text: "Por eso la cifra de 15.400 litros exagera el impacto: la lluvia no se gasta.",
    claims: [["gemini", 2]],
  },
  {
    // majority: Grok, ChatGPT, Gemini
    text: "El número cambia mucho según el sistema: los feedlots usan más agua de riego por los granos, y el pastoreo de la región pampeana casi nada.",
    claims: [
      ["grok", 2],
      ["openai", 2],
      ["gemini", 3],
    ],
  },
];

const s = (
  paragraph: string,
  op: "replace" | "insert_after" | "delete",
  text: string,
  reason: string,
  kind: "wrong" | "missing" | "misleading" = "wrong",
  sources: string[] = [],
) => ({ paragraph, op, kind, text, reason, sources });

const vote = (thread: string, choice: string, reason = "") => ({ thread, choice, reason });

// Round 1 makes, in model order: s1 (t1, Grok on p4), s2 (t2, Claude on p3), s3 (t3, ChatGPT
// inserts after p1), s4 (Gemini on p4: a second alternative in t1).
const ROUND1: Record<ModelId, unknown[]> = {
  grok: [
    s(
      "p4",
      "replace",
      "Hay quienes sostienen que esa cifra exagera el impacto porque la lluvia no se gasta; para medir la presión sobre ríos y napas importa más el agua de riego.",
      "El párrafo presenta una opinión como si fuera un hecho.",
      "misleading",
    ),
  ],
  claude: [
    s(
      "p3",
      "replace",
      "El agua que se saca de ríos y napas para riego y bebida ronda los 550 litros por kilo como promedio mundial; en los sistemas con mucho riego puede pasar los 1.000.",
      "El rango de 1.800 litros viene de feedlots con riego y no sirve como promedio.",
      "misleading",
      ["src1"],
    ),
  ],
  openai: [
    s(
      "p1",
      "insert_after",
      "Esa cifra suma toda el agua del ciclo: la lluvia que usan los pastos, el riego de los granos que comen los animales y el agua que toman.",
      "Antes de discutir la cifra hay que decir qué cuenta.",
      "missing",
      ["src1"],
    ),
  ],
  gemini: [
    s(
      "p4",
      "replace",
      "La cifra de 15.400 litros sobrestima el problema: la lluvia que cae sobre un campo de pastoreo no se le quita a nadie.",
      "Hay que dejar claro que la lluvia no compite con otros usos del agua.",
      "misleading",
    ),
  ],
};

// Round 2: votes on t1 to t3, and Grok's insertion after p5 (s5, t4). t2 and t3 are accepted.
const ROUND2: Record<ModelId, { votes: unknown[]; suggestions: unknown[] }> = {
  grok: {
    votes: [vote("t1", "s1"), vote("t2", "s2"), vote("t3", "s3")],
    suggestions: [
      s(
        "p5",
        "insert_after",
        "En la Argentina la mayor parte del ganado se cría a pasto, así que la huella de agua de riego por kilo es de las más bajas del mundo.",
        "Falta el dato local, que es lo que le importa a quien pregunta.",
        "missing",
        ["src2"],
      ),
    ],
  },
  claude: {
    votes: [vote("t1", "s1"), vote("t2", "s2"), vote("t3", "s3")],
    suggestions: [],
  },
  openai: {
    votes: [
      vote("t1", "keep", "El párrafo ya es claro tal como está."),
      vote("t2", "s2"),
      vote("t3", "s3"),
    ],
    suggestions: [],
  },
  gemini: {
    votes: [
      vote("t1", "s4"),
      vote("t2", "keep", "El rango completo muestra que el riego varía mucho."),
      vote("t3", "s3"),
    ],
    suggestions: [],
  },
};

// Round 3: ChatGPT changes its position on t1 (accepted, 3 of 4); t4 ends without agreement;
// Gemini does not answer.
const ROUND3: Record<ModelId, unknown[]> = {
  grok: [vote("t1", "s1"), vote("t4", "s5")],
  claude: [
    vote("t1", "s1"),
    vote(
      "t4",
      "keep",
      "El párrafo anterior ya habla del pastoreo pampeano; decir que es de las más bajas del mundo no tiene fuente.",
    ),
  ],
  openai: [
    vote("t1", "s1", "La versión de Grok separa bien el dato de la opinión; me convenció."),
    vote("t4", "s5", "El dato local le sirve a quien pregunta."),
  ],
  gemini: [],
};

/** How long each kind of call takes, in ms: enough to watch the run, short enough for tests. */
const DELAY: Record<string, number | Record<ModelId, number>> = {
  draft: { grok: 1800, claude: 2600, openai: 2200, gemini: 3200 },
  merge: 1500,
  round: { grok: 1100, claude: 1500, openai: 1300, gemini: 1700 },
  dedupe: 400,
  edit: 1200,
  brief: { grok: 1800, claude: 2600, openai: 2200, gemini: 3200 },
  "chart-merge": 1200,
  spec: 1500,
  "edit-check": 500,
  moments: 300,
};

function delayOf(kind: string, seat: ModelId | undefined): number {
  const d = DELAY[kind] ?? 300;
  return typeof d === "number" ? d : seat ? d[seat] : 300;
}

/** The claim ids of the merge prompt ("- B3 [high] text"), by their text. */
function claimIdsByText(prompt: string): Map<string, string> {
  const ids = new Map<string, string>();
  for (const m of prompt.matchAll(/^- (\w+) \[\w+\] (.*)$/gm)) ids.set(m[2] ?? "", m[1] ?? "");
  return ids;
}

/** Plain moments in rioplatense Spanish for the facts the reducer passes; none for the rest. */
function phraseMoments(prompt: string): string[] {
  const out: string[] = [];
  const said = (text: string) => {
    if (!out.includes(text) && out.length < 3) out.push(text);
  };
  if (/changed position/.test(prompt))
    said("ChatGPT cambió de opinión: la versión de Grok le pareció más justa con los datos.");
  if (/was accepted/.test(prompt) && /Claude/.test(prompt))
    said("Se aceptó la corrección de Claude sobre el agua de riego.");
  if (/proposed to replace/.test(prompt) && /Grok/.test(prompt))
    said("Grok y Gemini quieren cambiar el párrafo que dice que la cifra exagera.");
  if (/no agreement/.test(prompt))
    said("El dato sobre la Argentina no juntó acuerdo y queda anotado al margen.");
  return out;
}

export function respond(req: GenerateRequest<unknown>): FakeOutcome {
  const [kind = "", n, seatRaw] = req.callKey.split(":");
  const seat = seatRaw as ModelId | undefined;
  const delayMs = delayOf(kind, seat);
  const out = (output: unknown, extra: { sources?: FoundSource[]; costUsd?: number } = {}) =>
    ({
      output,
      usage: { inputTokens: 1200, outputTokens: 400 },
      costUsd: extra.costUsd ?? (seat ? 0.02 : 0.001),
      delayMs,
      ...(extra.sources ? { sources: extra.sources } : {}),
    }) satisfies FakeOutcome;

  const marked = (marker: string) => req.prompt.includes(marker);
  const chart = respondChart(req, out);
  if (chart) return chart;

  switch (kind) {
    case "draft": {
      if (!seat) break;
      const failKey = `${seat}:${req.prompt}`;
      if (marked(MARKERS.fail) && !failedOnce.has(failKey)) {
        failedOnce.add(failKey);
        return { kind: "error", message: "The local scenario fails this draft.", delayMs };
      }
      if (marked(MARKERS.fewDrafts) && (seat === "grok" || seat === "gemini"))
        return { kind: "error", message: "The local scenario drops this draft.", delayMs };
      return out(
        {
          answer: ANSWERS[seat],
          claims: CLAIMS[seat].map((c) => ({ ...c, confidence: "high" })),
        },
        // With the budget marker, four drafts leave less than the worst case of a round.
        { sources: FOUND[seat], costUsd: marked(MARKERS.budget) ? 0.7 : 0.05 },
      );
    }
    case "merge": {
      // Only the claims of the drafts that arrived are in the prompt; a paragraph keeps those.
      const ids = claimIdsByText(req.prompt);
      const paragraphs = MERGE.flatMap((p) => {
        const claims = p.claims.flatMap(([model, i]) => {
          const id = ids.get(CLAIMS[model][i]?.text ?? "");
          return id ? [id] : [];
        });
        return claims.length > 0 ? [{ text: p.text, claims }] : [];
      });
      return out({ paragraphs, conflicts: [] });
    }
    case "round":
      if (!seat) break;
      if (n === "1") return out({ suggestions: ROUND1[seat] });
      if (n === "2") return out(ROUND2[seat]);
      if (seat === "gemini") return { kind: "timeout" };
      return out({ votes: ROUND3[seat] });
    case "dedupe": {
      const pairs = [...req.prompt.matchAll(/^## (\S+)$/gm)].map((m) => m[1] ?? "");
      return out({ pairs: pairs.map((pair) => ({ pair, verdict: "different" })) });
    }
    case "edit":
      return out({
        paragraphs: [
          {
            id: "p1",
            text: "La cifra que más se cita es de unos 15.400 litros de agua por kilo de carne vacuna, como promedio mundial.",
          },
        ],
      });
    case "edit-check":
      return out({ checks: [{ id: "p1", verdict: "same" }] });
    case "moments":
      return out({ sentences: phraseMoments(req.prompt) });
  }
  return { kind: "error", message: `The local scenario has no answer for ${req.callKey}.` };
}

export function scenario(): FakeScript {
  return { respond };
}
