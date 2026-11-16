import type { RunEvent } from "./events.ts";
import {
  MODELS,
  type ModelId,
  type Paragraph,
  type ParagraphStatus,
  type Snapshot,
  type Suggestion,
  type SuggestionKind,
  type Tally,
  type Thread,
  type Vote,
} from "./model.ts";
import type { SuggestionOutput, VoteOutput } from "./schemas.ts";
import { byModelOrder, byNumericId, isOneSentence, normalizeText, uniqueSorted } from "./util.ts";

// The suggestion engine. Functions that take a `Book` change it in place: the reducer always passes
// a copy of its state, so the state it received is never changed.

/** The part of the run state the suggestion engine works on. */
export interface Book {
  suggestions: Record<string, Suggestion>;
  threads: Record<string, Thread>;
  /** The position of each model per thread: a suggestion id, or "keep". Absent: no position. */
  positions: Record<string, Partial<Record<ModelId, string>>>;
  votes: Vote[];
  /** Suggestions that lost: a duplicate of one of them is dropped (no second attempt). */
  rejected: string[];
  counters: { suggestion: number; thread: number };
}

export function emptyBook(): Book {
  return {
    suggestions: {},
    threads: {},
    positions: {},
    votes: [],
    rejected: [],
    counters: { suggestion: 0, thread: 0 },
  };
}

export type ChangeOp = "replace" | "insert_after" | "delete";

/**
 * The lock of a suggestion: one open thread per lock. A replacement or a deletion locks the
 * paragraph ("p3"); an insertion locks the place after the paragraph for its author ("p3+grok"),
 * so two insertions after the same paragraph are separate threads.
 */
export function lockKey(block: string, op: ChangeOp, author: ModelId): string {
  return op === "insert_after" ? `${block}+${author}` : block;
}

/** Suggestions that could be the same change: insertions after a block, or changes of it. */
function dedupeGroup(block: string, op: ChangeOp | Suggestion["op"]): string {
  return `${block}|${op === "insert_after" ? "insert" : "change"}`;
}

/** A suggestion that passed the checks of its round, not yet placed in a thread. */
export interface Candidate {
  model: ModelId;
  block: string;
  op: ChangeOp;
  kind: SuggestionKind;
  text: string;
  reason: string;
  sources: string[];
}

export type DropReason =
  | "over_cap"
  | "style"
  | "reason_not_one_sentence"
  | "unknown_paragraph"
  | "empty_text"
  | "no_change"
  | "same_lock"
  | "already_in_thread"
  | "own_duplicate"
  | "rejected_before";

export interface DroppedSuggestion {
  round: 1 | 2;
  model: ModelId;
  index: number; // position in the model's output
  why: DropReason;
}

/**
 * The checks of one model's suggestions in a round, in order: the cap first (extras are cut in
 * order, whatever their validity), then substance only (a "style" suggestion is dropped), a reason
 * of one sentence, a paragraph of the frozen snapshot, a text for a replacement or an insertion, a
 * replacement that changes the text, and one suggestion per lock. Unknown source ids are removed;
 * the suggestion stays.
 */
export function checkSuggestions(input: {
  model: ModelId;
  round: 1 | 2;
  suggestions: readonly SuggestionOutput[];
  cap: number;
  snapshot: Snapshot;
  knownSources: ReadonlySet<string>;
}): { candidates: Candidate[]; dropped: DroppedSuggestion[] } {
  const { model, round, snapshot } = input;
  const candidates: Candidate[] = [];
  const dropped: DroppedSuggestion[] = [];
  const locks = new Set<string>();
  for (const [index, s] of input.suggestions.entries()) {
    const drop = (why: DropReason) => dropped.push({ round, model, index, why });
    if (index >= input.cap) {
      drop("over_cap");
      continue;
    }
    if (s.kind === "style") {
      drop("style");
      continue;
    }
    if (!isOneSentence(s.reason)) {
      drop("reason_not_one_sentence");
      continue;
    }
    const block = s.paragraph.trim();
    const current = snapshot.blocks[block];
    if (current?.kind !== "paragraph" || !snapshot.order.includes(block)) {
      drop("unknown_paragraph");
      continue;
    }
    const text = s.op === "delete" ? "" : s.text.trim();
    if (s.op !== "delete" && text === "") {
      drop("empty_text");
      continue;
    }
    if (s.op === "replace" && normalizeText(text) === normalizeText(current.text)) {
      drop("no_change");
      continue;
    }
    const lock = lockKey(block, s.op, model);
    if (locks.has(lock)) {
      drop("same_lock");
      continue;
    }
    locks.add(lock);
    const sources = [...new Set(s.sources.map((id) => id.trim()))].filter((id) =>
      input.knownSources.has(id),
    );
    candidates.push({
      model,
      block,
      op: s.op,
      kind: s.kind,
      text,
      reason: s.reason.trim(),
      sources,
    });
  }
  return { candidates, dropped };
}

/**
 * A pair of suggestions that may be the same change. `decided` is set when code can tell (same
 * operation and same normalized text, two deletions, or a deletion against a replacement); the
 * others go to the utility model in one call per round.
 */
export interface DuplicatePair {
  id: string;
  candidate: number;
  other: { candidate: number } | { suggestion: string };
  decided: "same" | "different" | null;
}

/**
 * The pairs to check for each candidate, in the order they are matched: first the existing
 * suggestions of its group that are in an open thread or rejected (by id), then the earlier
 * candidates of its group.
 */
export function duplicatePairs(book: Book, candidates: readonly Candidate[]): DuplicatePair[] {
  const pairs: DuplicatePair[] = [];
  const existing = Object.values(book.suggestions)
    .filter((s) => book.threads[s.thread]?.state === "open" || book.rejected.includes(s.id))
    .sort((a, b) => byNumericId(a.id, b.id));
  candidates.forEach((c, i) => {
    const group = dedupeGroup(c.block, c.op);
    const add = (other: DuplicatePair["other"], op: Suggestion["op"], text: string) => {
      const decided =
        op !== c.op ? "different" : op === "delete" || sameText(text, c.text) ? "same" : null;
      pairs.push({ id: `d${pairs.length + 1}`, candidate: i, other, decided });
    };
    for (const s of existing) {
      if (dedupeGroup(s.target.block, s.op) === group) add({ suggestion: s.id }, s.op, s.text);
    }
    candidates.slice(0, i).forEach((o, j) => {
      if (dedupeGroup(o.block, o.op) === group && o.model !== c.model) {
        add({ candidate: j }, o.op, o.text);
      }
    });
  });
  return pairs;
}

function sameText(a: string, b: string): boolean {
  return normalizeText(a) === normalizeText(b);
}

export function pairsToAsk(pairs: readonly DuplicatePair[]): DuplicatePair[] {
  return pairs.filter((p) => p.decided === null);
}

/**
 * Places the candidates of a round, in their order (model order, then output order):
 * - a duplicate of a rejected suggestion is dropped: no second attempt;
 * - a duplicate of a live suggestion is merged into it: its model becomes a coAuthor and takes
 *   that suggestion as its position (a vote in favor); a duplicate of one's own suggestion is dropped;
 * - otherwise a suggestion whose lock has an open thread becomes an alternative of that thread
 *   (unless its author already proposed in it), and any other opens a new thread.
 * Pairs the model did not judge count as different.
 */
export function placeCandidates(
  book: Book,
  input: {
    candidates: readonly Candidate[];
    pairs: readonly DuplicatePair[];
    verdicts: Readonly<Record<string, "same" | "different">>;
    round: 1 | 2;
    baseVersion: number;
    batch: number;
  },
): {
  events: RunEvent[];
  dropped: DroppedSuggestion[];
  newSuggestions: number;
  changedPositions: number;
} {
  const { round, batch } = input;
  const events: RunEvent[] = [];
  const dropped: DroppedSuggestion[] = [];
  const placed: (string | null)[] = [];
  let newSuggestions = 0;
  let changedPositions = 0;
  const outputIndex = new Map<number, number>();
  const perModel = new Map<ModelId, number>();
  input.candidates.forEach((c, i) => {
    const n = perModel.get(c.model) ?? 0;
    outputIndex.set(i, n);
    perModel.set(c.model, n + 1);
  });

  const setPosition = (thread: string, model: ModelId, choice: string) => {
    const positions = book.positions[thread] ?? {};
    const previous = positions[model];
    if (previous !== undefined && previous !== choice) changedPositions++;
    positions[model] = choice;
    book.positions[thread] = positions;
  };

  for (const [i, c] of input.candidates.entries()) {
    const drop = (why: DropReason) => {
      dropped.push({ round, model: c.model, index: outputIndex.get(i) ?? i, why });
      placed[i] = null;
    };
    const matches = input.pairs.filter(
      (p) => p.candidate === i && (p.decided ?? input.verdicts[p.id] ?? "different") === "same",
    );
    const matched = matches
      .map((p) => ("suggestion" in p.other ? p.other.suggestion : placed[p.other.candidate]))
      .filter((id): id is string => typeof id === "string");
    if (matched.some((id) => book.rejected.includes(id))) {
      drop("rejected_before");
      continue;
    }
    const target = matched.find((id) => {
      const s = book.suggestions[id];
      return s !== undefined && book.threads[s.thread]?.state === "open";
    });

    if (target !== undefined) {
      const s = book.suggestions[target] as Suggestion;
      if (s.author === c.model || s.coAuthors.includes(c.model)) {
        drop("own_duplicate");
        continue;
      }
      s.coAuthors.push(c.model);
      setPosition(s.thread, c.model, s.id);
      placed[i] = s.id;
      events.push({
        key: `suggestion.merged:${s.id}:${c.model}`,
        batch,
        type: "suggestion.merged",
        suggestion: s.id,
        thread: s.thread,
        model: c.model,
        reason: c.reason,
      });
      continue;
    }

    const lock = lockKey(c.block, c.op, c.model);
    let thread = Object.values(book.threads).find((t) => t.state === "open" && t.lockKey === lock);
    if (thread) {
      const mine = thread.alternatives.some((id) => {
        const alt = book.suggestions[id];
        return alt?.author === c.model || alt?.coAuthors.includes(c.model);
      });
      if (mine) {
        drop("already_in_thread");
        continue;
      }
    }
    const newThread = thread === undefined;
    if (!thread) {
      const id = `t${++book.counters.thread}`;
      thread = {
        id,
        lockKey: lock,
        block: c.block,
        openedRound: round,
        alternatives: [],
        state: "open",
      };
      book.threads[id] = thread;
    }
    const suggestion: Suggestion = {
      id: `s${++book.counters.suggestion}`,
      thread: thread.id,
      author: c.model,
      coAuthors: [],
      round,
      baseVersion: input.baseVersion,
      target: { block: c.block },
      op: c.op,
      kind: c.kind,
      text: c.text,
      reason: c.reason,
      sources: c.sources,
    };
    book.suggestions[suggestion.id] = suggestion;
    thread.alternatives.push(suggestion.id);
    setPosition(thread.id, c.model, suggestion.id);
    placed[i] = suggestion.id;
    newSuggestions++;
    events.push({
      key: `suggestion.opened:${suggestion.id}`,
      batch,
      type: "suggestion.opened",
      suggestion: { ...suggestion, coAuthors: [] },
      lockKey: lock,
      newThread,
    });
  }
  return { events, dropped, newSuggestions, changedPositions };
}

/**
 * Records one model's votes of a round. A vote counts only on a thread that was open and shown
 * (`visible`), for "keep" or one of its alternatives; the first vote per thread wins. A first
 * position needs no reason. A vote that differs from the voter's previous position must carry a
 * reason, otherwise the previous position stands and the vote is ignored.
 */
export function castVotes(
  book: Book,
  input: {
    model: ModelId;
    round: 2 | 3;
    votes: readonly VoteOutput[];
    visible: ReadonlySet<string>;
    batch: number;
  },
): { events: RunEvent[]; changedPositions: number } {
  const { model, round, batch } = input;
  const events: RunEvent[] = [];
  const seen = new Set<string>();
  let changedPositions = 0;
  for (const v of input.votes) {
    const thread = book.threads[v.thread.trim()];
    if (thread?.state !== "open" || !input.visible.has(thread.id)) continue;
    if (seen.has(thread.id)) continue;
    const choice = v.choice.trim();
    if (choice !== "keep" && !thread.alternatives.includes(choice)) continue;
    const reason = v.reason.trim();
    const positions = book.positions[thread.id] ?? {};
    const previous = positions[model];
    const changed = previous !== undefined && previous !== choice;
    seen.add(thread.id);
    if (changed && reason === "") continue;
    if (changed) changedPositions++;
    positions[model] = choice;
    book.positions[thread.id] = positions;
    book.votes.push({ thread: thread.id, voter: model, round, choice, reason, changed });
    events.push({
      key: `vote.cast:${round}:${thread.id}:${model}`,
      batch,
      type: "vote.cast",
      thread: thread.id,
      model,
      round,
      choice,
      changed,
      reason,
    });
  }
  return { events, changedPositions };
}

/** Who holds `choice` in a thread, who holds something else, and who holds nothing. */
export function tally(book: Book, thread: string, choice: string): Tally {
  const positions = book.positions[thread] ?? {};
  const result: Tally = { for: [], against: [], none: [] };
  for (const m of MODELS) {
    const p = positions[m];
    if (p === undefined) result.none.push(m);
    else if (p === choice) result.for.push(m);
    else result.against.push(m);
  }
  return result;
}

/**
 * The voting rule. An alternative is accepted when at least 2 models other than its author hold
 * it, and they are a strict majority of the other models that hold a position in the thread.
 * - CoAuthors (merged duplicates) hold the alternative: each counts as a vote in favor.
 * - The author's own position is not counted, for or against, on its own alternative.
 * - A model that abstained keeps the position it held; a model that never held a position in the
 *   thread is not counted at all (it is not part of "the other models that voted").
 */
export function qualifies(book: Book, threadId: string, suggestionId: string): boolean {
  const s = book.suggestions[suggestionId];
  if (!s) return false;
  const positions = book.positions[threadId] ?? {};
  let holders = 0;
  let voters = 0;
  for (const m of MODELS) {
    if (m === s.author) continue;
    const p = positions[m];
    if (p === undefined) continue;
    voters++;
    if (p === suggestionId) holders++;
  }
  return holders >= 2 && holders * 2 > voters;
}

/** "Keep" wins the same way: at least 2 models hold it, a strict majority of those with a position. */
export function keepQualifies(book: Book, threadId: string): boolean {
  const positions = book.positions[threadId] ?? {};
  const held = Object.values(positions);
  const keep = held.filter((p) => p === "keep").length;
  return keep >= 2 && keep * 2 > held.length;
}

/**
 * Resolves open threads at a round boundary. With `final` false only threads that went through a
 * voting round are considered (opened before `round`), and a thread that is not decided stays
 * open; with `final` true every open thread ends. Exactly one qualifying alternative is accepted;
 * two qualifying alternatives apply neither (open, or unresolved at the end); a qualifying "keep"
 * rejects the thread; anything else stays open, or ends unresolved. The losing alternatives of an
 * accepted thread and all alternatives of a rejected one join the rejected list.
 */
export function resolveThreads(
  book: Book,
  input: { final: boolean; round: number; batch: number },
): { events: RunEvent[]; accepted: string[] } {
  const events: RunEvent[] = [];
  const accepted: string[] = [];
  const open = Object.values(book.threads)
    .filter((t) => t.state === "open" && (input.final || t.openedRound < input.round))
    .sort((a, b) => byNumericId(a.id, b.id));
  for (const thread of open) {
    const qualifying = thread.alternatives.filter((id) => qualifies(book, thread.id, id));
    const [winner] = qualifying;
    if (qualifying.length === 1 && winner !== undefined) {
      thread.state = "accepted";
      thread.winner = winner;
      thread.tally = tally(book, thread.id, winner);
      reject(
        book,
        thread.alternatives.filter((id) => id !== winner),
      );
      accepted.push(thread.id);
      events.push({
        key: `thread.accepted:${thread.id}`,
        batch: input.batch,
        type: "thread.accepted",
        thread: thread.id,
        winner,
        tally: thread.tally,
      });
    } else if (qualifying.length === 0 && keepQualifies(book, thread.id)) {
      thread.state = "rejected";
      thread.tally = tally(book, thread.id, "keep");
      reject(book, thread.alternatives);
      events.push({
        key: `thread.rejected:${thread.id}`,
        batch: input.batch,
        type: "thread.rejected",
        thread: thread.id,
        tally: thread.tally,
      });
    } else if (input.final) {
      thread.state = "unresolved";
      thread.why = qualifying.length > 1 ? "two_qualify" : "no_majority";
      thread.tally = tally(book, thread.id, "keep");
      events.push({
        key: `thread.unresolved:${thread.id}`,
        batch: input.batch,
        type: "thread.unresolved",
        thread: thread.id,
        why: thread.why,
        tally: thread.tally,
      });
    }
  }
  return { events, accepted };
}

function reject(book: Book, ids: readonly string[]) {
  for (const id of ids) if (!book.rejected.includes(id)) book.rejected.push(id);
}

/** An accepted change, ready to apply. */
export interface Change {
  thread: string;
  op: ChangeOp;
  block: string; // the target, or the anchor of an insertion ("" inserts at the start)
  author: ModelId;
  text: string;
  sources: string[];
  support: ModelId[]; // the models that held the winner
}

export function statusFromSupport(support: readonly ModelId[], conflict: boolean): ParagraphStatus {
  if (conflict) return "contested";
  if (support.length >= MODELS.length) return "agreed";
  if (support.length === MODELS.length - 1) return "majority";
  return "contested";
}

/**
 * Applies accepted changes to a snapshot in ONE deterministic pass by paragraph ID, and returns a
 * new snapshot with the next version. Changes are keyed by ID, so their order in the input does not
 * matter: the pass walks the paragraphs in document order, replaces or deletes each targeted one,
 * then places the insertions anchored on it in the fixed model order of their authors (ties by
 * thread id). New paragraphs get the next IDs in the order they are placed. A replacement or
 * deletion of a paragraph that no longer exists is skipped and reported.
 */
export function apply(
  snapshot: Snapshot,
  changes: readonly Change[],
  nextParagraph: number,
): {
  snapshot: Snapshot;
  nextParagraph: number;
  created: Record<string, string>;
  skipped: string[];
} {
  const sorted = [...changes].sort((a, b) => byNumericId(a.thread, b.thread));
  const edits = new Map<string, Change>();
  const inserts = new Map<string, Change[]>();
  const skipped: string[] = [];
  for (const c of sorted) {
    if (c.op === "insert_after") {
      const list = inserts.get(c.block) ?? [];
      list.push(c);
      inserts.set(c.block, list);
    } else if (!snapshot.blocks[c.block] || edits.has(c.block)) {
      skipped.push(c.thread);
    } else {
      edits.set(c.block, c);
    }
  }
  for (const list of inserts.values()) {
    list.sort((a, b) => byModelOrder(a.author, b.author) || byNumericId(a.thread, b.thread));
  }
  for (const [anchor, list] of inserts) {
    if (anchor !== "" && !snapshot.order.includes(anchor))
      skipped.push(...list.map((c) => c.thread));
  }

  const order: string[] = [];
  const blocks: Record<string, Snapshot["blocks"][string]> = {};
  const created: Record<string, string> = {};
  let next = nextParagraph;
  const place = (anchor: string) => {
    for (const c of inserts.get(anchor) ?? []) {
      const id = `p${next++}`;
      created[c.thread] = id;
      order.push(id);
      blocks[id] = paragraph(id, c.text, c.support, sortIds(c.sources), []);
    }
  };
  place("");
  for (const id of snapshot.order) {
    const block = snapshot.blocks[id];
    if (!block) continue;
    const edit = edits.get(id);
    if (edit?.op === "delete") {
      // deleted: its insertions still land where it was
    } else if (edit?.op === "replace" && block.kind === "paragraph") {
      order.push(id);
      blocks[id] = paragraph(
        id,
        edit.text,
        edit.support,
        sortIds([...block.sources, ...edit.sources]),
        [],
      );
    } else {
      order.push(id);
      blocks[id] = block;
    }
    place(id);
  }
  return {
    snapshot: { version: snapshot.version + 1, order, blocks },
    nextParagraph: next,
    created,
    skipped,
  };
}

function paragraph(
  id: string,
  text: string,
  support: readonly ModelId[],
  sources: string[],
  claims: string[],
): Paragraph {
  const s = uniqueSorted(support, byModelOrder);
  return {
    kind: "paragraph",
    id,
    text,
    support: s,
    status: statusFromSupport(s, false),
    sources,
    claims,
  };
}

function sortIds(ids: readonly string[]): string[] {
  return uniqueSorted(ids, byNumericId);
}

/**
 * The anchor of an insertion in the current snapshot. Suggestions target IDs, so an anchor that
 * still exists is used as is. If the anchor was deleted since the suggestion's base version, the
 * insertion goes after the closest paragraph before it (in the base version) that still exists,
 * or at the start.
 */
export function resolveAnchor(
  history: readonly Snapshot[],
  current: Snapshot,
  s: Suggestion,
): string {
  const block = s.target.block;
  if (current.order.includes(block)) return block;
  const base = history.find((h) => h.version === s.baseVersion);
  if (!base) return "";
  const at = base.order.indexOf(block);
  for (let i = at - 1; i >= 0; i--) {
    const id = base.order[i];
    if (id !== undefined && current.order.includes(id)) return id;
  }
  return "";
}

/** The changes of accepted threads, with their anchors resolved against the current snapshot. */
export function changesOf(
  book: Book,
  threadIds: readonly string[],
  history: readonly Snapshot[],
  current: Snapshot,
): Change[] {
  const changes: Change[] = [];
  for (const id of threadIds) {
    const thread = book.threads[id];
    const s = thread?.winner ? book.suggestions[thread.winner] : undefined;
    if (!thread || !s || s.op === "patch") continue;
    changes.push({
      thread: id,
      op: s.op,
      block: s.op === "insert_after" ? resolveAnchor(history, current, s) : s.target.block,
      author: s.author,
      text: s.text,
      sources: s.sources,
      support: thread.tally?.for ?? [s.author],
    });
  }
  return changes;
}
