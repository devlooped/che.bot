import type { Snapshot, Source } from "../model.ts";

/** A system and a user prompt. Prompts explain the rules; the reducer enforces them. */
export interface Prompt {
  system: string;
  prompt: string;
}

export const LANGUAGE_RULE =
  "Write every text you return in the language of the question (Spanish if the question is in Spanish, and so on), whatever the language of these instructions.";

/** What a question, or one point of it, asks (kind) and its answer in one word (rating). */
export const VERDICT_RULE =
  "kind: claim when it asks to check something stated (a statement, a quote, a rumor, «¿Es cierto que...?»); question when it asks for a yes or a no; fact when it asks for a fact, a figure, a list, an explanation or advice. rating: for a claim, true, false, depends (misleading: true only in part, out of context or exaggerated) or unknown (the evidence does not settle it); for a question, true (yes), false (no), depends (it depends, or it is debated) or unknown (nobody can tell yet); for a fact, none.";

/**
 * The country of the person asking, for a question that names no place: "Censo 2025" or "Inflación
 * de los últimos 10 años" are about it. Null when the country is not known.
 */
export function countryRule(country: string | null | undefined): string | null {
  const name = country?.trim();
  if (!name) return null;
  return `The person asking lives in ${name}. When the question names no place and would have a different answer in another country (a census, inflation, prices, taxes, laws, elections, holidays), take it to be about ${name} and say so in a few words. When it names a place, or no place changes the answer, ignore this.`;
}

export const STRUCTURED_RULE =
  "Return only the structured object requested, with every field present. Leave a list empty rather than inventing content.";

/**
 * The document as the models read it: each paragraph with its id. A chart stands in its place as a
 * reference to the charts listed apart (`charts: "ref"`), or as a short summary of what it shows
 * (`"summary"`, for a reader who does not change it).
 */
export function renderDocument(
  snapshot: Snapshot,
  support = true,
  charts: "ref" | "summary" = "ref",
): string {
  const lines: string[] = [];
  for (const id of snapshot.order) {
    const block = snapshot.blocks[id];
    if (block?.kind === "chart") {
      lines.push(
        charts === "ref"
          ? `[${id}] (a chart: see "Charts" below)`
          : `[${id}] (a chart, not yours to change) ${JSON.stringify(block.title)}: ${block.caption}\nData: ${block.data.rows
              .map(
                (r) =>
                  `${r.key} ${r.values.value ?? r.alternatives.map((a) => a.values.value).join("-")}`,
              )
              .join("; ")}`,
      );
      continue;
    }
    if (block?.kind !== "paragraph") continue;
    const meta = support
      ? ` (${block.status}, ${block.support.length} of 4${block.sources.length ? `, sources: ${block.sources.join(", ")}` : ""})`
      : "";
    lines.push(`[${id}]${meta}\n${block.text}`);
  }
  return lines.join("\n\n");
}

export function renderSources(sources: readonly Source[]): string {
  if (sources.length === 0) return "(none)";
  return sources.map((s) => `${s.id}: ${s.title || s.url} <${s.url}>`).join("\n");
}

export function quote(text: string): string {
  return text
    .split(/\r?\n/)
    .map((l) => `> ${l}`)
    .join("\n");
}
