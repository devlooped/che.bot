import {
  MODELS,
  type ModelId,
  type RunView,
  type Suggestion,
  type Thread,
  type Vote,
} from "@chebot/protocol";

// The discussion of a thread, from the replayed view: its proposals, and where each model stood.
// Paragraphs (derive.ts) and the layers of a chart (chart.ts) open the same discussion.

/** One model's place in a discussion: what it holds at the end, and the votes it gave. */
export interface Position {
  model: ModelId;
  /** A suggestion id, "keep", or null when it never took a position. */
  choice: string | null;
  votes: Vote[];
  /** The reason of its last change of position, if it changed. */
  changedBecause: string | null;
  /** The reason it gave for its position without changing it, if any. */
  saidWhy: string | null;
}

export interface Discussion {
  thread: Thread;
  alternatives: Suggestion[];
  positions: Position[];
}

export function discussionOf(view: RunView, thread: Thread): Discussion {
  const held = view.positions[thread.id] ?? {};
  return {
    thread,
    alternatives: thread.alternatives.flatMap((id) => {
      const s = view.suggestions[id];
      return s ? [s] : [];
    }),
    positions: MODELS.map((model) => {
      const votes = view.votes.filter((v) => v.thread === thread.id && v.voter === model);
      const changed = votes.findLast((v) => v.changed && v.reason);
      const said = votes.findLast((v) => !v.changed && v.reason);
      return {
        model,
        choice: held[model] ?? null,
        votes,
        changedBecause: changed?.reason ?? null,
        saidWhy: changed ? null : (said?.reason ?? null),
      };
    }),
  };
}
