import type { EventOf, EventType, RunEvent } from "./events.ts";
import {
  type Chart,
  type ChartLayer,
  MODEL_NAMES,
  type ModelId,
  type Suggestion,
} from "./model.ts";
import { byModelOrder } from "./util.ts";

// Moments: the plain one-liners of the glimpse. One utility call per round boundary phrases a batch
// of events; these fixed templates (rioplatense Spanish, plain words, no technical terms) are the
// fallback when the call fails, is skipped, or the budget is spent.

const MAX_MOMENTS = 3;

function of<T extends EventType>(events: readonly RunEvent[], type: T): EventOf<T>[] {
  return events.filter((e): e is EventOf<T> => e.type === type);
}

function names(models: Iterable<ModelId>): string {
  const list = [...new Set(models)].sort(byModelOrder).map((m) => MODEL_NAMES[m]);
  if (list.length <= 1) return list.join("");
  return `${list.slice(0, -1).join(", ")} y ${list.at(-1)}`;
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/** What the templates know besides the events. */
export interface MomentContext {
  /** The suggestions of the run: they tell whether a change is to the text or to a chart, and to which part. */
  suggestions?: Readonly<Record<string, Suggestion>>;
}

/** The suggestions of a thread, from the run's. */
function ofThread(
  suggestions: Readonly<Record<string, Suggestion>> | undefined,
  thread: string,
): Suggestion | undefined {
  return Object.values(suggestions ?? {}).find((s) => s.thread === thread);
}

const CHART_PARTS: Record<ChartLayer, string> = {
  title: "el título del gráfico",
  encoding: "el tipo de gráfico",
  caption: "la explicación del gráfico",
  transform: "el cálculo del gráfico",
  data: "los datos del gráfico",
};

/** One template per kind of event, in order of importance; the first 3 that apply are used. */
const TEMPLATES: ((events: readonly RunEvent[], ctx: MomentContext) => string | null)[] = [
  (events) => {
    const cut = of(events, "stage.changed").find((e) => e.cut !== null)?.cut;
    if (cut === "budget")
      return "Se terminó el presupuesto de esta pregunta, así que cerramos con lo que hay.";
    if (cut === "deadline") return "Se acabó el tiempo previsto, así que cerramos con lo que hay.";
    return null;
  },
  (events) =>
    of(events, "run.failed").length > 0 ? "No pudimos armar una respuesta esta vez." : null,
  (events) => {
    const out = of(events, "model.status").filter((e) => e.status === "abstained");
    if (out.length === 0) return null;
    const who = new Set(out.map((e) => e.model));
    return who.size === 1
      ? `${names(who)} no llegó a contestar esta vez y sigue el resto.`
      : `${names(who)} no llegaron a contestar esta vez y sigue el resto.`;
  },
  (events) => {
    const charts = chartsOf(of(events, "document.seeded")[0]);
    if (charts.length === 0) return null;
    const rows = charts.flatMap((c) => c.data.rows);
    const check = rows.filter((r) => r.status === "single" || r.status === "disputed").length;
    const what =
      charts.length === 1
        ? `un gráfico con ${rows.length} ${plural(rows.length, "dato", "datos")}`
        : `${charts.length} gráficos con ${rows.length} datos`;
    return check === 0
      ? `Sumamos a la respuesta ${what}, y coinciden en todos.`
      : `Sumamos a la respuesta ${what}, y ${check} ${plural(check, "queda", "quedan")} para verificar con las fuentes.`;
  },
  (events) => {
    const settled = of(events, "dispute.settled");
    const held = settled.filter((e) => e.state === "held").length;
    const range = settled.filter((e) => e.state === "unsettled").length;
    if (held + range === 0) return null;
    const parts = [
      held
        ? `${held} ${plural(held, "dato quedó confirmado", "datos quedaron confirmados")} por su fuente`
        : "",
      range ? `en ${range} las fuentes no coinciden y se muestra el rango` : "",
    ].filter(Boolean);
    return `${parts.join("; ")}.`.replace(/^./, (c) => c.toUpperCase());
  },
  (events) => {
    const seeded = of(events, "document.seeded")[0];
    if (!seeded) return null;
    const statuses = Object.values(seeded.snapshot.blocks).flatMap((b) =>
      b.kind === "paragraph" ? [b.status] : [],
    );
    const contested = statuses.filter((s) => s === "contested").length;
    const shared = statuses.length - contested;
    if (contested === 0) return "Juntamos las respuestas en un solo texto y coinciden en todo.";
    return `Juntamos las respuestas en un solo texto: coinciden en ${shared} ${plural(shared, "parte", "partes")} y hay ${contested} en discusión.`;
  },
  (events) => {
    const n = of(events, "draft.completed").length;
    if (n === 0) return null;
    return n === 4
      ? "Los cuatro ya tienen su propia respuesta, cada uno por su cuenta."
      : `${n} de los cuatro tienen su propia respuesta.`;
  },
  (events, ctx) => {
    const accepted = of(events, "thread.accepted");
    const [first] = accepted;
    if (!first) return null;
    const layers = accepted.map((e) => ctx.suggestions?.[e.winner]?.target.layer);
    if (accepted.length === 1) {
      const part = layers[0] ? `en ${CHART_PARTS[layers[0]]}` : "al texto";
      return `Se aceptó un cambio ${part}, con el apoyo de ${first.tally.for.length} de 4.`;
    }
    const where = layers.every((l) => l)
      ? "a los gráficos"
      : layers.some((l) => l)
        ? "al texto y a los gráficos"
        : "al texto";
    return `Se aceptaron ${accepted.length} cambios ${where}.`;
  },
  (events, ctx) => {
    const unresolved = of(events, "thread.unresolved");
    const n = unresolved.length;
    if (n === 0) return null;
    const charts = unresolved.filter((e) => ofThread(ctx.suggestions, e.thread)?.target.layer);
    if (charts.length === n)
      return n === 1
        ? "En un punto de un gráfico no hubo acuerdo y queda como estaba."
        : `En ${n} puntos de los gráficos no hubo acuerdo y quedan como estaban.`;
    return n === 1
      ? "En un punto no hubo acuerdo y queda anotado al margen."
      : `En ${n} puntos no hubo acuerdo y quedan anotados al margen.`;
  },
  (events) => {
    const who = new Set(
      of(events, "vote.cast")
        .filter((e) => e.changed)
        .map((e) => e.model),
    );
    if (who.size === 0) return null;
    return who.size === 1
      ? `${names(who)} cambió de opinión después de leer los argumentos de los demás.`
      : `${names(who)} cambiaron de opinión después de leer los argumentos de los demás.`;
  },
  (events) => {
    const opened = of(events, "suggestion.opened");
    if (opened.length === 0) return null;
    const who = new Set(opened.map((e) => e.suggestion.author));
    return opened.length === 1
      ? `${names(who)} propuso corregir una parte ${opened[0]?.suggestion.target.layer ? "de un gráfico" : "del texto"}.`
      : `Hay ${opened.length} propuestas de cambio sobre la mesa, de ${names(who)}.`;
  },
  (events) => {
    const n = of(events, "thread.rejected").length;
    if (n === 0) return null;
    return n === 1
      ? "Una propuesta no consiguió apoyo y esa parte queda como estaba."
      : `${n} propuestas no consiguieron apoyo y esas partes quedan como estaban.`;
  },
  (events) => {
    const who = new Set(of(events, "suggestion.merged").map((e) => e.model));
    if (who.size === 0) return null;
    return `${names(who)} ${plural(who.size, "propuso", "propusieron")} lo mismo que otro y ${plural(who.size, "suma", "suman")} su apoyo.`;
  },
  (events) => {
    const declined = of(events, "chart.declined").filter((e) => e.why === "one_draft");
    const [first] = declined;
    if (!first) return null;
    return declined.length === 1
      ? `${names(first.models)} ${plural(first.models.length, "propuso", "propusieron")} un gráfico, pero los demás no lo armaron, así que la respuesta sigue sin él.`
      : "Hubo propuestas de gráficos que los demás no armaron, así que la respuesta sigue sin ellas.";
  },
  (events) =>
    of(events, "snapshot.created").some((e) => e.cause === "edit")
      ? "Se pulió la redacción final sin cambiar el contenido."
      : null,
  (events) =>
    of(events, "run.started").length > 0
      ? "Arrancamos: cada uno va a responder tu pregunta por su cuenta."
      : null,
  (events) =>
    of(events, "run.completed").length > 0 ? "Listo: la respuesta está terminada." : null,
];

function chartsOf(seeded: EventOf<"document.seeded"> | undefined): Chart[] {
  if (!seeded) return [];
  return Object.values(seeded.snapshot.blocks).filter((b): b is Chart => b.kind === "chart");
}

/** The template moments of a batch of events: at most 3 sentences, most important first. */
export function templateMoments(events: readonly RunEvent[], ctx: MomentContext = {}): string[] {
  const out: string[] = [];
  for (const template of TEMPLATES) {
    const text = template(events, ctx);
    if (text) out.push(text);
    if (out.length === MAX_MOMENTS) break;
  }
  return out;
}

/** The parts of a chart in plain English: the facts name them so the phrasing says no technical term. */
const CHART_PARTS_EN: Record<ChartLayer, string> = {
  title: "the title of the chart",
  encoding: "the type of chart",
  caption: "the explanation under the chart",
  transform: "the calculation of the chart",
  data: "the data of the chart",
};

/**
 * The events of a batch as plain English facts, for the utility call that phrases the moments. A
 * proposal on a chart names the part of the chart it is about, and what has no agreement on a
 * chart stays noted under it.
 */
export function momentFacts(
  events: readonly RunEvent[],
  suggestions: Readonly<Record<string, Suggestion>>,
): string[] {
  const facts: string[] = [];
  const name = (m: ModelId) => MODEL_NAMES[m];
  const partOf = (s: Suggestion | undefined) =>
    s?.target.layer ? CHART_PARTS_EN[s.target.layer] : null;
  for (const e of events) {
    switch (e.type) {
      case "stage.changed":
        if (e.cut)
          facts.push(`The ${e.cut} of the question ran out: the work closes with what exists.`);
        break;
      case "model.status":
        if (e.status === "abstained") facts.push(`${name(e.model)} did not answer this time.`);
        break;
      case "draft.completed":
        facts.push(
          `${name(e.model)} finished its own answer, alone, with ${e.claims.length} key points${e.charts.length ? ` and ${e.charts.length === 1 ? "a chart" : `${e.charts.length} charts`} of figures, each with its source` : ""}.`,
        );
        break;
      case "chart.declined":
        facts.push(
          e.why === "one_draft"
            ? `${e.models.map(name).join(" and ")} proposed a chart of ${e.measure}, but no other made one: the answer goes without it.`
            : `A chart of ${e.measure} was left out: the answer already has three charts.`,
        );
        break;
      case "dispute.settled":
        facts.push(
          e.state === "held"
            ? `The sources settled the value of ${e.row}: one value's source holds up.`
            : e.state === "unsettled"
              ? `The sources of ${e.row} disagree: the chart shows the range of values.`
              : e.state === "unverified"
                ? `The only source of ${e.row} did not hold up when checked: the value is marked.`
                : `Nobody checked ${e.row}.`,
        );
        break;
      case "patch.dropped":
        if (e.why === "render_failed")
          facts.push(
            `A change to the chart by ${name(e.model)} was dropped: the chart did not draw with it.`,
          );
        break;
      case "document.seeded": {
        const statuses = Object.values(e.snapshot.blocks).flatMap((b) =>
          b.kind === "paragraph" ? [b.status] : [],
        );
        const count = (s: string) => statuses.filter((x) => x === s).length;
        facts.push(
          `The answers were merged into one text: ${count("agreed")} parts all four agree on, ${count("majority")} parts three agree on, ${count("contested")} parts in dispute.`,
        );
        for (const chart of chartsOf(e))
          facts.push(
            `The figures were merged into a chart of ${chart.brief.measures[0] ?? "data"} inside the answer, with ${chart.data.rows.length} values, ${chart.data.rows.filter((r) => r.status === "single" || r.status === "disputed").length} of them to check against their sources.`,
          );
        break;
      }
      case "suggestion.opened": {
        const part = partOf(e.suggestion);
        facts.push(
          part
            ? `${name(e.suggestion.author)} proposed a change to ${part}, because: ${e.suggestion.reason}`
            : `${name(e.suggestion.author)} proposed to ${e.suggestion.op.replace("_", " ")} a part of the text, because: ${e.suggestion.reason}`,
        );
        break;
      }
      case "suggestion.merged":
        facts.push(`${name(e.model)} proposed the same change as another and supports it.`);
        break;
      case "vote.cast":
        if (e.changed) facts.push(`${name(e.model)} changed position, because: ${e.reason}`);
        break;
      case "thread.accepted": {
        const s = suggestions[e.winner];
        const part = partOf(s);
        facts.push(
          `A change${part ? ` to ${part}` : ""}${s ? ` proposed by ${name(s.author)} (${s.reason})` : ""} was accepted, ${e.tally.for.length} of 4 in favor.`,
        );
        break;
      }
      case "thread.rejected":
        facts.push("A proposed change found no support; that part stays as it was.");
        break;
      case "thread.unresolved": {
        const part = partOf(ofThread(suggestions, e.thread));
        facts.push(
          part
            ? `There was no agreement on a proposed change to ${part}; it stays noted under the chart as a proposal without agreement.`
            : "There was no agreement on a proposed change; it stays as a note in the margin.",
        );
        break;
      }
      case "snapshot.created":
        if (e.cause === "edit")
          facts.push("The final wording was polished without changing the content.");
        break;
      default:
        break;
    }
  }
  return facts;
}
