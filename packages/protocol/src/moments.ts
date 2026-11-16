import type { EventOf, EventType, RunEvent } from "./events.ts";
import { MODEL_NAMES, type ModelId, type Suggestion } from "./model.ts";
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

/** One template per kind of event, in order of importance; the first 3 that apply are used. */
const TEMPLATES: ((events: readonly RunEvent[]) => string | null)[] = [
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
    const seeded = of(events, "document.seeded")[0];
    if (!seeded) return null;
    const statuses = Object.values(seeded.snapshot.blocks).map((b) =>
      b.kind === "paragraph" ? b.status : "agreed",
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
  (events) => {
    const accepted = of(events, "thread.accepted");
    const [first] = accepted;
    if (!first) return null;
    return accepted.length === 1
      ? `Se aceptó un cambio al texto, con el apoyo de ${first.tally.for.length} de 4.`
      : `Se aceptaron ${accepted.length} cambios al texto.`;
  },
  (events) => {
    const n = of(events, "thread.unresolved").length;
    if (n === 0) return null;
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
      ? `${names(who)} propuso corregir una parte del texto.`
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

/** The template moments of a batch of events: at most 3 sentences, most important first. */
export function templateMoments(events: readonly RunEvent[]): string[] {
  const out: string[] = [];
  for (const template of TEMPLATES) {
    const text = template(events);
    if (text) out.push(text);
    if (out.length === MAX_MOMENTS) break;
  }
  return out;
}

/** The events of a batch as plain English facts, for the utility call that phrases the moments. */
export function momentFacts(
  events: readonly RunEvent[],
  suggestions: Readonly<Record<string, Suggestion>>,
): string[] {
  const facts: string[] = [];
  const name = (m: ModelId) => MODEL_NAMES[m];
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
          `${name(e.model)} finished its own answer, alone, with ${e.claims.length} key points.`,
        );
        break;
      case "document.seeded": {
        const statuses = Object.values(e.snapshot.blocks).map((b) =>
          b.kind === "paragraph" ? b.status : "agreed",
        );
        const count = (s: string) => statuses.filter((x) => x === s).length;
        facts.push(
          `The answers were merged into one text: ${count("agreed")} parts all four agree on, ${count("majority")} parts three agree on, ${count("contested")} parts in dispute.`,
        );
        break;
      }
      case "suggestion.opened":
        facts.push(
          `${name(e.suggestion.author)} proposed to ${e.suggestion.op.replace("_", " ")} a part of the text, because: ${e.suggestion.reason}`,
        );
        break;
      case "suggestion.merged":
        facts.push(`${name(e.model)} proposed the same change as another and supports it.`);
        break;
      case "vote.cast":
        if (e.changed) facts.push(`${name(e.model)} changed position, because: ${e.reason}`);
        break;
      case "thread.accepted": {
        const s = suggestions[e.winner];
        facts.push(
          `A change${s ? ` proposed by ${name(s.author)} (${s.reason})` : ""} was accepted, ${e.tally.for.length} of 4 in favor.`,
        );
        break;
      }
      case "thread.rejected":
        facts.push("A proposed change found no support; that part stays as it was.");
        break;
      case "thread.unresolved":
        facts.push(
          "There was no agreement on a proposed change; it stays as a note in the margin.",
        );
        break;
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
