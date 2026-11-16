import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { z } from "zod";

export const CATEGORIES = [
  "stable_fact",
  "recent_fact",
  "multi_step",
  "contested",
  "how_to",
  "false_premise",
] as const;
export type Category = (typeof CATEGORIES)[number];

const questionSchema = z.object({
  id: z.string().min(1),
  category: z.enum(CATEGORIES),
  lang: z.string(),
  question: z.string().min(1),
  class: z.enum(["simple", "complex"]),
  gold: z.string().nullable(),
  rubric: z.string().nullable(),
  asOf: z.string().nullable().optional(),
  sources: z.array(z.string()).optional(),
});
export type Question = z.infer<typeof questionSchema>;

/** Reads a question set (JSON lines). Throws on an invalid line, a duplicate id or a question with neither gold nor rubric. */
export function readQuestions(file: string): Question[] {
  const out: Question[] = [];
  const ids = new Set<string>();
  readFileSync(file, "utf8")
    .split("\n")
    .forEach((line, i) => {
      if (line.trim() === "") return;
      const parsed = questionSchema.safeParse(JSON.parse(line));
      if (!parsed.success) throw new Error(`${file}:${i + 1}: ${parsed.error.message}`);
      const q = parsed.data;
      if (ids.has(q.id)) throw new Error(`${file}:${i + 1}: duplicate id ${q.id}`);
      if (q.gold === null && q.rubric === null)
        throw new Error(`${file}:${i + 1}: ${q.id} has neither a gold answer nor a rubric`);
      ids.add(q.id);
      out.push(q);
    });
  return out;
}

/** The key of a question on disk: its id and a hash of its text, so an edited question starts over. */
export function questionKey(q: Pick<Question, "id" | "question">): string {
  return `${q.id}-${sha(q.question).slice(0, 8)}`;
}

export function sha(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** What a judge grades against: the gold answer, or the rubric. */
export function reference(q: Question): { kind: "gold" | "rubric"; text: string } {
  return q.gold !== null
    ? { kind: "gold", text: q.gold }
    : { kind: "rubric", text: q.rubric ?? "" };
}
