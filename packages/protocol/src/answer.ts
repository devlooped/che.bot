import {
  type Abstention,
  type Flags,
  MODELS,
  type ModelId,
  type ParagraphStatus,
  type Snapshot,
  type Source,
  type Suggestion,
  type Thread,
} from "./model.ts";
import { byNumericId } from "./util.ts";

/** What the answer selector reads: both the run state and the replayed view provide it. */
export interface AnswerInput {
  status: string;
  snapshots: readonly Snapshot[];
  threads: Readonly<Record<string, Thread>>;
  suggestions: Readonly<Record<string, Suggestion>>;
  positions: Readonly<Record<string, Partial<Record<ModelId, string>>>>;
  sources: readonly Source[];
  flags: Flags;
  abstentions: readonly Abstention[];
}

export interface AnswerParagraph {
  id: string;
  text: string;
  status: ParagraphStatus;
  support: ModelId[];
  tally: { for: number; of: number }; // "3 de 4" is { for: 3, of: 4 }
  sources: string[];
}

/** A suggestion still open, or unresolved at the end: shown as a dissent note in the margin. */
export interface DissentNote {
  thread: string;
  block: string;
  state: "open" | "unresolved";
  suggestion: string;
  author: ModelId;
  coAuthors: ModelId[];
  op: Suggestion["op"];
  text: string;
  reason: string;
  holders: ModelId[]; // the models that hold this suggestion
}

export interface Answer {
  version: number;
  final: boolean; // the run completed and this is its last version
  text: string;
  paragraphs: AnswerParagraph[];
  dissent: DissentNote[];
  sources: Source[]; // the sources cited by the paragraphs, by id
  flags: Flags;
  abstained: {
    model: ModelId;
    call: string;
    stage: Abstention["stage"];
    reason: Abstention["reason"];
  }[];
}

/**
 * What a UI or the CLI prints for a run, at its latest version or at `version` (the history
 * slider). Dissent notes, flags and abstentions describe the run as it stands. Null before the
 * document exists or for an unknown version.
 */
export function selectAnswer(input: AnswerInput, version?: number): Answer | null {
  const last = input.snapshots.at(-1);
  const snapshot =
    version === undefined ? last : input.snapshots.find((s) => s.version === version);
  if (!snapshot || !last) return null;
  const paragraphs: AnswerParagraph[] = [];
  for (const id of snapshot.order) {
    const b = snapshot.blocks[id];
    if (b?.kind !== "paragraph") continue;
    paragraphs.push({
      id,
      text: b.text,
      status: b.status,
      support: [...b.support],
      tally: { for: b.support.length, of: MODELS.length },
      sources: [...b.sources],
    });
  }
  const cited = new Set(paragraphs.flatMap((p) => p.sources));
  const dissent: DissentNote[] = [];
  const threads = Object.values(input.threads)
    .filter((t) => t.state === "open" || t.state === "unresolved")
    .sort((a, b) => byNumericId(a.id, b.id));
  for (const t of threads) {
    const positions = input.positions[t.id] ?? {};
    for (const id of t.alternatives) {
      const s = input.suggestions[id];
      if (!s) continue;
      dissent.push({
        thread: t.id,
        block: t.block,
        state: t.state as "open" | "unresolved",
        suggestion: id,
        author: s.author,
        coAuthors: [...s.coAuthors],
        op: s.op,
        text: s.text,
        reason: s.reason,
        holders: MODELS.filter((m) => positions[m] === id),
      });
    }
  }
  return {
    version: snapshot.version,
    final: input.status === "completed" && snapshot.version === last.version,
    text: paragraphs.map((p) => p.text).join("\n\n"),
    paragraphs,
    dissent,
    sources: input.sources.filter((s) => cited.has(s.id)).sort((a, b) => byNumericId(a.id, b.id)),
    flags: { ...input.flags },
    abstained: input.abstentions.flatMap((a) =>
      a.seat === "utility"
        ? []
        : [{ model: a.seat, call: a.call, stage: a.stage, reason: a.reason }],
    ),
  };
}
