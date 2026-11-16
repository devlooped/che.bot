import {
  MODELS,
  type ModelId,
  type ModelSnapshot,
  normalizeText,
  type RunState,
  STRUCTURED_RULE,
  type Suggestion,
  seededShuffle,
  selectAnswer,
} from "@chebot/protocol";
import { ProviderError } from "@chebot/providers";
import { z } from "zod";
import type { LedgerEntry } from "../driver.ts";
import { CallRefused, type Guarded } from "./budget.ts";
import { type Question, reference, sha } from "./questions.ts";

// Blind judging. The four panel models judge; every prompt shows answers by a neutral number or
// letter in an order seeded by the question, the judge and the task, so a rerun asks the same thing
// (and reads it from the ledger). No prompt names a model, an arm or a stage of the protocol.

/** The arms: each model's draft alone (S), the merged document (Q), the final answer (T). */
export type Arm = `S:${ModelId}` | "Q" | "T";
export const SINGLE_ARMS: readonly Arm[] = MODELS.map((m) => `S:${m}` as const);
export const ARMS: readonly Arm[] = [...SINGLE_ARMS, "Q", "T"];

export const JUDGE_TIMEOUT_MS = 120_000;
export const JUDGE_MAX_OUTPUT_TOKENS = 6000;
/** The worst case of one judge call, reserved against the cap before it starts. */
export const JUDGE_WORST_USD = 0.12;

export interface Answers {
  /** The text of each arm; null when the arm has no answer (a missing draft, a failed run). */
  arms: Record<Arm, string | null>;
  /** The final answer with the rotating editor, when the run had an editor step. */
  rotation: string | null;
}

export function answersOf(state: RunState | null, rotation: RunState | null): Answers {
  const arms = Object.fromEntries(ARMS.map((a) => [a, null])) as Record<Arm, string | null>;
  if (state) {
    for (const d of state.drafts) arms[`S:${d.model}`] = d.answer;
    arms.Q = selectAnswer(state, 1)?.text ?? null;
    arms.T = selectAnswer(state)?.text ?? null;
  }
  return { arms, rotation: rotation ? (selectAnswer(rotation)?.text ?? null) : null };
}

export function sameText(a: string | null, b: string | null): boolean {
  return a !== null && b !== null && normalizeText(a) === normalizeText(b);
}

// ---------------------------------------------------------------------------------------------
// Schemas: the simple subset of the protocol's schemas (required fields, string enums, arrays).

const QUALITY = ["1", "2", "3", "4", "5"] as const;

export const gradeGoldSchema = z.object({
  grades: z.array(
    z.object({
      answer: z.string().describe("The number of the answer."),
      correct: z.enum(["correct", "incorrect"]),
      quality: z.enum(QUALITY),
    }),
  ),
});

export const gradeRubricSchema = z.object({
  grades: z.array(
    z.object({
      answer: z.string().describe("The number of the answer."),
      quality: z.enum(QUALITY),
    }),
  ),
});

export const compareSchema = z.object({
  pairs: z.array(
    z.object({
      pair: z.string().describe("The number of the pair."),
      substance: z.enum(["same", "different"]),
      preference: z.enum(["A", "B", "tie"]),
    }),
  ),
});

export const auditSchema = z.object({
  changes: z.array(
    z.object({
      item: z.string().describe("The number of the position change."),
      verdict: z.enum(["new_argument", "deference"]),
    }),
  ),
  suggestions: z.array(
    z.object({
      item: z.string().describe("The number of the suggestion."),
      verdict: z.enum(["right", "wrong", "unclear"]),
    }),
  ),
});

export const JUDGE_SCHEMAS = {
  gradeGold: gradeGoldSchema,
  gradeRubric: gradeRubricSchema,
  compare: compareSchema,
  /** T against the best single model: an extra measure, asked apart so the compare calls stay as they were. */
  compareTs: compareSchema,
  audit: auditSchema,
} as const;

// ---------------------------------------------------------------------------------------------
// Prompts

const BLIND =
  "Nothing tells you who or what wrote the texts you see, and you must not guess: judge only what they say.";

function referenceBlock(q: Question): string {
  const ref = reference(q);
  return ref.kind === "gold"
    ? `# Reference answer\n\n${ref.text}`
    : `# Grading guide\n\nThere is no single correct answer. A good answer meets this guide:\n\n${ref.text}`;
}

function header(q: Question): string {
  return `# Question\n\n${q.question}\n\n${referenceBlock(q)}`;
}

/** One answer graded: the arms that gave this text, and its label in the prompt of a judge. */
export interface GradeItem {
  label: string;
  arms: Arm[];
  text: string;
}

/** The distinct answers of a question (arms with the same text are graded once), in the order a judge sees them. */
export function gradeItems(answers: Answers, seed: string): GradeItem[] {
  const groups: { arms: Arm[]; text: string }[] = [];
  for (const arm of ARMS) {
    const text = answers.arms[arm];
    if (text === null || text.trim() === "") continue;
    const same = groups.find((g) => sameText(g.text, text));
    if (same) same.arms.push(arm);
    else groups.push({ arms: [arm], text });
  }
  return seededShuffle(groups, seed).map((g, i) => ({ ...g, label: String(i + 1) }));
}

export function gradePrompt(q: Question, items: readonly GradeItem[]) {
  const gold = q.gold !== null;
  const system = [
    "You are an impartial grader in a blind evaluation of answers to one question. Each answer is between <answer> tags, numbered in a random order.",
    BLIND,
    "Judge each answer on its own against the reference, not against the other answers. Length, confidence and style count only as far as they help or hinder the reader.",
    gold
      ? 'For each answer, say whether it is correct: "correct" when what it gives as the answer agrees with the reference answer on every point the reference requires; "incorrect" when it contradicts the reference, gives another answer, leaves the required answer out, or hedges between a right and a wrong answer.'
      : "",
    `For each answer, give a quality grade from 1 to 5: 5 ${gold ? "correct" : "fully meets the grading guide"}, complete and clear; 4 ${gold ? "correct" : "meets the guide"} with minor gaps or excess; 3 partly right or noticeably incomplete; 2 mostly wrong, unfair or misleading; 1 wrong, off-topic or useless.`,
    "Return one entry per answer, with its number. The answers may be in another language than these instructions.",
    STRUCTURED_RULE,
  ]
    .filter((l) => l !== "")
    .join("\n\n");
  const prompt = `${header(q)}\n\n# Answers\n\n${items.map((i) => `<answer number="${i.label}">\n${i.text}\n</answer>`).join("\n\n")}`;
  return { system, prompt };
}

/**
 * A pair compared: `first` is the arm whose wins are counted (Q against the best single model,
 * T against Q, the closest editor against the rotating one, T against the best single model).
 */
export type PairKind = "qs" | "tq" | "ed" | "ts";
export interface PairSpec {
  kind: PairKind;
  first: string;
  second: string;
}

export interface ShownPair {
  label: string;
  kind: PairKind;
  /** Whether A is the first answer of the spec. */
  firstIsA: boolean;
  a: string;
  b: string;
}

export function showPairs(pairs: readonly PairSpec[], seed: string): ShownPair[] {
  return seededShuffle(pairs, `${seed}|pairs`).map((p, i) => {
    const firstIsA = seededShuffle([true, false], `${seed}|${p.kind}`)[0] as boolean;
    return {
      label: String(i + 1),
      kind: p.kind,
      firstIsA,
      a: firstIsA ? p.first : p.second,
      b: firstIsA ? p.second : p.first,
    };
  });
}

export function comparePrompt(q: Question, shown: readonly ShownPair[]) {
  const system = [
    "You compare pairs of answers to one question in a blind evaluation. Each pair is between <pair> tags, with answer A and answer B; which answer is A and which is B was decided at random.",
    BLIND,
    'For each pair, "preference" is "A" or "B" for the answer that serves the reader better (correct against the reference first, then complete, fair and clear), or "tie" when neither is better.',
    '"substance" is "same" when both answers make the same claims and reach the same conclusions, differing only in wording, order or style; "different" when one states, leaves out or qualifies something of substance that the other does not.',
    "Judge each pair on its own. Return one entry per pair, with its number. The answers may be in another language than these instructions.",
    STRUCTURED_RULE,
  ].join("\n\n");
  const prompt = `${header(q)}\n\n# Pairs\n\n${shown
    .map(
      (p) =>
        `<pair number="${p.label}">\n<answer_a>\n${p.a}\n</answer_a>\n<answer_b>\n${p.b}\n</answer_b>\n</pair>`,
    )
    .join("\n\n")}`;
  return { system, prompt };
}

/** A vote that changed position, as the audit shows it. */
export interface AuditChange {
  id: string;
  passage: string;
  options: { id: string; text: string }[];
  from: string;
  to: string;
  reason: string;
}

/** A suggestion that did not make it into the answer: left open or unresolved, or rejected. */
export interface AuditNote {
  id: string;
  state: "open" | "unresolved" | "rejected";
  passage: string;
  change: string;
  reason: string;
}

function passageOf(state: RunState, block: string): string {
  for (const s of [...state.snapshots].reverse()) {
    const b = s.blocks[block];
    if (b?.kind === "paragraph") return b.text;
  }
  return "";
}

function describeChange(s: Suggestion): string {
  if (s.op === "delete") return "Delete the passage.";
  if (s.op === "insert_after") return `Add after the passage: ${s.text}`;
  return `Replace the passage with: ${s.text}`;
}

/** The position changes and the dissent of a run, for the audit. */
export function auditItems(state: RunState | null): { changes: AuditChange[]; notes: AuditNote[] } {
  if (!state) return { changes: [], notes: [] };
  const held = new Map<string, string>();
  const keyOf = (thread: string, model: ModelId) => `${thread}|${model}`;
  for (const s of Object.values(state.suggestions)) {
    for (const m of [s.author, ...s.coAuthors])
      if (!held.has(keyOf(s.thread, m))) held.set(keyOf(s.thread, m), s.id);
  }
  const changes: AuditChange[] = [];
  for (const v of state.votes) {
    const k = keyOf(v.thread, v.voter);
    const from = held.get(k) ?? "keep";
    held.set(k, v.choice);
    if (!v.changed) continue;
    const thread = state.threads[v.thread];
    if (!thread) continue;
    const options = [
      { id: "keep", text: "Keep the passage as it is." },
      ...thread.alternatives.flatMap((id) => {
        const s = state.suggestions[id];
        return s ? [{ id, text: `${describeChange(s)} (proposed because: ${s.reason})` }] : [];
      }),
    ];
    changes.push({
      id: `${v.thread}/${v.voter}/${v.round}`,
      passage: passageOf(state, thread.block),
      options,
      from,
      to: v.choice,
      reason: v.reason,
    });
  }
  const notes: AuditNote[] = [];
  for (const t of Object.values(state.threads)) {
    if (t.state === "accepted") continue;
    for (const id of t.alternatives) {
      const s = state.suggestions[id];
      if (!s) continue;
      notes.push({
        id,
        state: t.state as AuditNote["state"],
        passage: passageOf(state, t.block),
        change: describeChange(s),
        reason: s.reason,
      });
    }
  }
  return { changes, notes };
}

export function auditPrompt(
  q: Question,
  changes: readonly (AuditChange & { label: string })[],
  notes: readonly (AuditNote & { label: string })[],
) {
  const system = [
    "Several reviewers edited one answer to a question together by proposing changes to its passages and voting on them. You audit two kinds of items from that work.",
    BLIND,
    'Position changes: a reviewer moved its vote from one option to another and gave a reason. "new_argument" when the reason brings a fact, a source or an argument about the content itself; "deference" when it only follows the other reviewers or the majority, or restates the option without a reason of its own.',
    'Suggestions: changes that were proposed and not adopted. Judge each against the reference: "right" when adopting it would have made the answer more correct, complete or fair; "wrong" when it would have made the answer worse or added nothing of value; "unclear" when the reference does not settle it.',
    "Return one entry per item, with its number; an empty list when there are no items of a kind. The items may be in another language than these instructions.",
    STRUCTURED_RULE,
  ].join("\n\n");
  const changeText = changes.map(
    (c) =>
      `## Change ${c.label}\n\nPassage: ${c.passage}\n\nOptions:\n${c.options.map((o) => `- ${o.id}: ${o.text}`).join("\n")}\n\nEarlier position: ${c.from}\nNew position: ${c.to}\nReason given: ${c.reason || "(none)"}`,
  );
  const noteText = notes.map(
    (n) =>
      `## Suggestion ${n.label}\n\nPassage: ${n.passage}\n\nProposed: ${n.change}\nReason given: ${n.reason}`,
  );
  const prompt = `${header(q)}\n\n# Position changes\n\n${changeText.join("\n\n") || "(none)"}\n\n# Suggestions\n\n${noteText.join("\n\n") || "(none)"}`;
  return { system, prompt };
}

export function labelled<T>(items: readonly T[], seed: string): (T & { label: string })[] {
  return seededShuffle(items, seed).map((item, i) => ({ ...item, label: String(i + 1) }));
}

// ---------------------------------------------------------------------------------------------
// Calls

export type JudgeKind = keyof typeof JUDGE_SCHEMAS;

export type JudgeOutcome<T> =
  | { status: "ok"; output: T }
  | { status: "abstained"; reason: string }
  | { status: "refused" };

/**
 * One judge call, read from the ledger when it was made before. The key holds a hash of the
 * prompt, so a judge asked something else (another best single model, an answer that changed) is a
 * new call, and the same question is never paid twice.
 */
export async function judgeCall<K extends JudgeKind>(input: {
  guarded: Guarded;
  models: ModelSnapshot;
  judge: ModelId;
  kind: K;
  system: string;
  prompt: string;
  onCall?: (key: string, entry: LedgerEntry & { cached: boolean }) => void;
}): Promise<JudgeOutcome<z.infer<(typeof JUDGE_SCHEMAS)[K]>>> {
  const { guarded, judge, kind } = input;
  const schema = JUDGE_SCHEMAS[kind];
  const model = input.models[`panel.${judge}`];
  if (!model) throw new Error(`The model snapshot has no panel.${judge}.`);
  const key = `${kind}:${judge}:${sha(`${model.id}\n${input.system}\n${input.prompt}`).slice(0, 16)}`;
  const read = (entry: LedgerEntry): JudgeOutcome<z.infer<(typeof JUDGE_SCHEMAS)[K]>> => {
    if (entry.result.status !== "ok") return { status: "abstained", reason: entry.result.reason };
    const parsed = schema.safeParse(entry.result.output);
    return parsed.success
      ? { status: "ok", output: parsed.data as z.infer<(typeof JUDGE_SCHEMAS)[K]> }
      : { status: "abstained", reason: "invalid" };
  };
  const kept = await guarded.ledger.get(key);
  if (kept) {
    input.onCall?.(key, { ...kept, cached: true });
    return read(kept);
  }
  const started = Date.now();
  let entry: LedgerEntry;
  try {
    const out = await guarded.provider.generate({
      callKey: key,
      model,
      system: input.system,
      prompt: input.prompt,
      schema: schema as z.ZodType,
      maxOutputTokens: JUDGE_MAX_OUTPUT_TOKENS,
      signal: AbortSignal.timeout(JUDGE_TIMEOUT_MS),
    });
    entry = {
      result: {
        status: "ok",
        key,
        output: out.output,
        sources: [],
        usage: out.usage,
        costUsd: out.costUsd,
        latencyMs: out.latencyMs,
      },
      seat: judge,
      model,
      error: null,
      usage: null,
    };
  } catch (error) {
    if (error instanceof CallRefused) return { status: "refused" };
    const failure = ProviderError.isInstance(error) ? error : null;
    entry = {
      result: {
        status: "abstained",
        key,
        reason: failure?.kind ?? "error",
        costUsd: failure?.costUsd ?? 0,
        latencyMs: failure?.latencyMs ?? Date.now() - started,
      },
      seat: judge,
      model,
      error: error instanceof Error ? error.message : String(error),
      usage: failure?.usage ?? null,
    };
  }
  await guarded.ledger.put(key, entry);
  input.onCall?.(key, { ...entry, cached: false });
  return read(entry);
}
