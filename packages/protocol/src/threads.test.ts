import fc from "fast-check";
import { describe, expect, test } from "vitest";
import type { ModelId, Paragraph, Snapshot } from "./model.ts";
import type { SuggestionOutput } from "./schemas.ts";
import {
  apply,
  type Book,
  type Candidate,
  type Change,
  castVotes,
  checkSuggestions,
  duplicatePairs,
  emptyBook,
  lockKey,
  pairsToAsk,
  placeCandidates,
  qualifies,
  resolveAnchor,
  resolveThreads,
} from "./threads.ts";
import { isOneSentence } from "./util.ts";

function para(id: string, text: string): Paragraph {
  return { kind: "paragraph", id, text, support: [], status: "contested", sources: [], claims: [] };
}

function doc(...texts: string[]): Snapshot {
  const order = texts.map((_, i) => `p${i + 1}`);
  return {
    version: 1,
    order,
    blocks: Object.fromEntries(order.map((id, i) => [id, para(id, texts[i] ?? "")])),
  };
}

const SNAP = doc("Uno.", "Dos.", "Tres.");

function out(
  paragraph: string,
  op: SuggestionOutput["op"],
  text = "Texto nuevo.",
  reason = "Está mal.",
) {
  return { paragraph, op, kind: "wrong", text, reason, sources: [] } as SuggestionOutput;
}

function cand(
  model: ModelId,
  block: string,
  op: Candidate["op"],
  text = "Texto nuevo.",
): Candidate {
  return { model, block, op, kind: "wrong", text, reason: "Está mal.", sources: [] };
}

/** Places candidates; pairs the model would judge get `verdict`. */
function placeAll(
  book: Book,
  candidates: Candidate[],
  round: 1 | 2 = 1,
  verdict: "same" | "different" = "different",
) {
  const pairs = duplicatePairs(book, candidates);
  const verdicts = Object.fromEntries(pairsToAsk(pairs).map((p) => [p.id, verdict]));
  return placeCandidates(book, { candidates, pairs, verdicts, round, baseVersion: 1, batch: 1 });
}

function vote(
  book: Book,
  model: ModelId,
  thread: string,
  choice: string,
  reason = "",
  round: 2 | 3 = 2,
) {
  return castVotes(book, {
    model,
    round,
    votes: [{ thread, choice, reason }],
    visible: new Set(Object.keys(book.threads)),
    batch: 2,
  });
}

describe("lock keys", () => {
  test("a change locks the paragraph, an insertion the place after it for its author", () => {
    expect(lockKey("p3", "replace", "grok")).toBe("p3");
    expect(lockKey("p3", "delete", "claude")).toBe("p3");
    expect(lockKey("p3", "insert_after", "grok")).toBe("p3+grok");
  });
});

describe("the checks of a model's suggestions", () => {
  const check = (suggestions: SuggestionOutput[], cap = 3, known = new Set(["src1"])) =>
    checkSuggestions({
      model: "grok",
      round: 1,
      suggestions,
      cap,
      snapshot: SNAP,
      knownSources: known,
    });

  test("the cap cuts extras in order, whatever their validity", () => {
    const r = check([
      out("p9", "replace"),
      out("p1", "replace"),
      out("p2", "delete"),
      out("p3", "replace"),
    ]);
    expect(r.candidates.map((c) => c.block)).toEqual(["p1", "p2"]);
    expect(r.dropped.map((d) => [d.index, d.why])).toEqual([
      [0, "unknown_paragraph"],
      [3, "over_cap"],
    ]);
    expect(
      check([out("p1", "replace"), out("p2", "replace"), out("p3", "replace")], 2).candidates,
    ).toHaveLength(2);
  });

  test("substance only: a style suggestion is dropped", () => {
    expect(check([{ ...out("p1", "replace"), kind: "style" }]).dropped[0]?.why).toBe("style");
  });

  test("a reason longer than one sentence drops the suggestion", () => {
    const r = check([out("p1", "replace", "Nuevo.", "La cifra está mal. Además falta la fuente.")]);
    expect(r.dropped[0]?.why).toBe("reason_not_one_sentence");
    expect(check([out("p1", "replace", "Nuevo.", "")]).dropped[0]?.why).toBe(
      "reason_not_one_sentence",
    );
  });

  test("empty texts, no-op replacements and a second suggestion on one lock are dropped", () => {
    const r = check(
      [
        out("p1", "replace", "  "),
        out("p2", "replace", "dos"),
        out("p3", "delete"),
        out("p3", "replace"),
      ],
      4,
    );
    expect(r.dropped.map((d) => d.why)).toEqual(["empty_text", "no_change", "same_lock"]);
    expect(r.candidates).toEqual([
      expect.objectContaining({ block: "p3", op: "delete", text: "" }),
    ]);
  });

  test("unknown source ids are removed, the suggestion stays", () => {
    const r = check([{ ...out("p1", "replace"), sources: ["src1", "src7", "src1"] }]);
    expect(r.candidates[0]?.sources).toEqual(["src1"]);
  });

  test("one sentence, with abbreviations", () => {
    expect(isOneSentence("La cifra de EE. UU. está mal.")).toBe(true);
    expect(isOneSentence("Según el Dr. Pérez la cifra es otra.")).toBe(true);
    expect(isOneSentence("The U.S. Census says 3.5 million.")).toBe(true);
    expect(isOneSentence("Wrong figure. Use the census.")).toBe(false);
    expect(isOneSentence("Una línea\notra línea")).toBe(false);
  });
});

describe("collisions", () => {
  test("the same change twice is merged: the second author is a coAuthor and holds it", () => {
    const book = emptyBook();
    const r = placeAll(book, [cand("grok", "p2", "delete"), cand("claude", "p2", "delete")]);
    expect(Object.keys(book.threads)).toEqual(["t1"]);
    expect(book.suggestions.s1?.coAuthors).toEqual(["claude"]);
    expect(book.positions.t1).toEqual({ grok: "s1", claude: "s1" });
    expect(r.events.map((e) => e.type)).toEqual(["suggestion.opened", "suggestion.merged"]);
    expect(r.newSuggestions).toBe(1);
  });

  test("the utility model decides duplicates that code cannot", () => {
    const book = emptyBook();
    const candidates = [
      cand("grok", "p1", "replace", "A es B."),
      cand("claude", "p1", "replace", "B es A."),
    ];
    const pairs = duplicatePairs(book, candidates);
    expect(pairsToAsk(pairs).map((p) => p.id)).toEqual(["d1"]);
    placeAll(book, candidates, 1, "same");
    expect(book.suggestions.s1?.coAuthors).toEqual(["claude"]);
  });

  test("different changes to one paragraph are alternatives in one thread", () => {
    const book = emptyBook();
    placeAll(book, [
      cand("grok", "p1", "replace", "A."),
      cand("claude", "p1", "delete"),
      cand("openai", "p1", "replace", "B."),
    ]);
    expect(Object.values(book.threads)).toEqual([
      expect.objectContaining({ id: "t1", lockKey: "p1", alternatives: ["s1", "s2", "s3"] }),
    ]);
    expect(book.positions.t1).toEqual({ grok: "s1", claude: "s2", openai: "s3" });
  });

  test("two different insertions after one paragraph are separate threads, applied in model order", () => {
    const book = emptyBook();
    placeAll(book, [
      cand("claude", "p1", "insert_after", "De Claude."),
      cand("grok", "p1", "insert_after", "De Grok."),
    ]);
    expect(Object.values(book.threads).map((t) => t.lockKey)).toEqual(["p1+claude", "p1+grok"]);
    const changes: Change[] = [
      {
        thread: "t1",
        op: "insert_after",
        block: "p1",
        author: "claude",
        text: "De Claude.",
        sources: [],
        support: [],
      },
      {
        thread: "t2",
        op: "insert_after",
        block: "p1",
        author: "grok",
        text: "De Grok.",
        sources: [],
        support: [],
      },
    ];
    const r = apply(SNAP, changes, 4);
    expect(r.snapshot.order).toEqual(["p1", "p4", "p5", "p2", "p3"]);
    expect((r.snapshot.blocks.p4 as Paragraph).text).toBe("De Grok.");
  });

  test("identical insertions after one paragraph are the same change", () => {
    const book = emptyBook();
    placeAll(book, [
      cand("grok", "p1", "insert_after", "Igual."),
      cand("claude", "p1", "insert_after", "igual"),
    ]);
    expect(Object.keys(book.threads)).toEqual(["t1"]);
    expect(book.suggestions.s1?.coAuthors).toEqual(["claude"]);
  });
});

describe("locks and the rejected list", () => {
  test("a suggestion on a locked paragraph joins its thread; a second one by the same author is dropped", () => {
    const book = emptyBook();
    placeAll(book, [cand("grok", "p1", "replace", "A.")]);
    const r = placeAll(
      book,
      [cand("claude", "p1", "replace", "B."), cand("grok", "p1", "delete")],
      2,
    );
    expect(book.threads.t1?.alternatives).toEqual(["s1", "s2"]);
    expect(Object.keys(book.threads)).toEqual(["t1"]);
    expect(r.dropped.map((d) => [d.model, d.why])).toEqual([["grok", "already_in_thread"]]);
  });

  test("a resolved thread no longer locks its paragraph", () => {
    const book = emptyBook();
    placeAll(book, [cand("grok", "p1", "replace", "A.")]);
    vote(book, "claude", "t1", "keep");
    vote(book, "openai", "t1", "keep");
    vote(book, "gemini", "t1", "keep");
    resolveThreads(book, { final: false, round: 2, batch: 2 });
    expect(book.threads.t1?.state).toBe("rejected");
    placeAll(book, [cand("claude", "p1", "replace", "C.")], 2);
    expect(book.threads.t2?.lockKey).toBe("p1");
  });

  test("no second attempt: a duplicate of a rejected suggestion is dropped", () => {
    const book = emptyBook();
    placeAll(book, [cand("grok", "p1", "replace", "A.")]);
    for (const m of ["claude", "openai", "gemini"] as const) vote(book, m, "t1", "keep");
    resolveThreads(book, { final: false, round: 2, batch: 2 });
    expect(book.rejected).toEqual(["s1"]);
    const byCode = placeAll(book, [cand("claude", "p1", "replace", "a")], 2);
    expect(byCode.dropped.map((d) => d.why)).toEqual(["rejected_before"]);
    const byModel = placeAll(
      book,
      [cand("openai", "p1", "replace", "Lo mismo, en otras palabras.")],
      2,
      "same",
    );
    expect(byModel.dropped.map((d) => d.why)).toEqual(["rejected_before"]);
    expect(Object.keys(book.suggestions)).toEqual(["s1"]);
  });

  test("the losing alternatives of an accepted thread join the rejected list", () => {
    const book = emptyBook();
    placeAll(book, [cand("grok", "p1", "replace", "A."), cand("claude", "p1", "replace", "B.")]);
    vote(book, "openai", "t1", "s1");
    vote(book, "gemini", "t1", "s1");
    resolveThreads(book, { final: false, round: 2, batch: 2 });
    expect(book.threads.t1).toMatchObject({ state: "accepted", winner: "s1" });
    expect(book.rejected).toEqual(["s2"]);
  });
});

describe("the voting rule", () => {
  function thread(...extra: [ModelId, string][]) {
    const book = emptyBook();
    placeAll(book, [cand("grok", "p1", "replace", "A.")]);
    for (const [m, c] of extra) vote(book, m, "t1", c);
    return book;
  }

  test("2 others holding it, a majority of the others who voted: accepted", () => {
    expect(
      qualifies(thread(["claude", "s1"], ["openai", "s1"], ["gemini", "keep"]), "t1", "s1"),
    ).toBe(true);
    expect(
      qualifies(thread(["claude", "s1"], ["openai", "keep"], ["gemini", "keep"]), "t1", "s1"),
    ).toBe(false);
  });

  test("an abstaining model is not counted: 2 of the 2 others who voted is enough", () => {
    const book = thread(["claude", "s1"], ["openai", "s1"]);
    expect(qualifies(book, "t1", "s1")).toBe(true);
    const r = resolveThreads(book, { final: false, round: 2, batch: 2 });
    expect(r.accepted).toEqual(["t1"]);
    expect(book.threads.t1?.tally).toEqual({
      for: ["grok", "claude", "openai"],
      against: [],
      none: ["gemini"],
    });
  });

  test("one other holder is never enough, even when nobody else voted", () => {
    expect(qualifies(thread(["claude", "s1"]), "t1", "s1")).toBe(false);
  });

  test("a coAuthor counts as a vote in favor; the author's own position does not count", () => {
    const book = emptyBook();
    placeAll(book, [cand("grok", "p2", "delete"), cand("claude", "p2", "delete")]);
    vote(book, "openai", "t1", "s1");
    expect(qualifies(book, "t1", "s1")).toBe(true);
    vote(book, "grok", "t1", "keep", "Lo pensé mejor.");
    expect(qualifies(book, "t1", "s1")).toBe(true);
  });

  test("two qualifying alternatives: neither is applied (open until the end, then unresolved)", () => {
    const book = emptyBook();
    // grok proposes s1 and claude s2; then each moves to the other's, and openai and gemini split.
    placeAll(book, [cand("grok", "p1", "replace", "A."), cand("claude", "p1", "replace", "B.")]);
    vote(book, "grok", "t1", "s2", "Me convenció.");
    vote(book, "claude", "t1", "s1", "Me convenció.");
    vote(book, "openai", "t1", "s1");
    vote(book, "gemini", "t1", "s2");
    expect(qualifies(book, "t1", "s1")).toBe(true);
    expect(qualifies(book, "t1", "s2")).toBe(true);
    expect(resolveThreads(book, { final: false, round: 2, batch: 2 }).accepted).toEqual([]);
    expect(book.threads.t1?.state).toBe("open");
    resolveThreads(book, { final: true, round: 3, batch: 3 });
    expect(book.threads.t1).toMatchObject({ state: "unresolved", why: "two_qualify" });
  });

  test("keep held by a majority rejects; a split ends unresolved", () => {
    const rejected = thread(["claude", "keep"], ["openai", "keep"], ["gemini", "keep"]);
    resolveThreads(rejected, { final: false, round: 2, batch: 2 });
    expect(rejected.threads.t1?.state).toBe("rejected");
    const split = thread(["claude", "s1"], ["openai", "keep"], ["gemini", "keep"]);
    resolveThreads(split, { final: false, round: 2, batch: 2 });
    expect(split.threads.t1?.state).toBe("open");
    resolveThreads(split, { final: true, round: 3, batch: 3 });
    expect(split.threads.t1).toMatchObject({ state: "unresolved", why: "no_majority" });
  });

  test("a thread is decided only after a voting round, unless the rounds end", () => {
    const book = emptyBook();
    placeAll(
      book,
      [
        cand("grok", "p2", "delete"),
        cand("claude", "p2", "delete"),
        cand("openai", "p2", "delete"),
      ],
      2,
    );
    expect(resolveThreads(book, { final: false, round: 2, batch: 2 }).accepted).toEqual([]);
    expect(resolveThreads(book, { final: true, round: 2, batch: 2 }).accepted).toEqual(["t1"]);
  });

  test("a changed position needs a reason, otherwise the previous one stands", () => {
    const book = thread(["claude", "s1"]);
    const ignored = vote(book, "claude", "t1", "keep", "", 3);
    expect(ignored.events).toEqual([]);
    expect(book.positions.t1?.claude).toBe("s1");
    const changed = vote(book, "claude", "t1", "keep", "La fuente no lo dice.", 3);
    expect(changed.changedPositions).toBe(1);
    expect(changed.events[0]).toMatchObject({
      type: "vote.cast",
      changed: true,
      reason: "La fuente no lo dice.",
    });
    expect(book.positions.t1?.claude).toBe("keep");
  });

  test("votes on unknown threads or choices, and second votes on a thread, are ignored", () => {
    const book = thread();
    const r = castVotes(book, {
      model: "claude",
      round: 2,
      votes: [
        { thread: "t9", choice: "keep", reason: "" },
        { thread: "t1", choice: "s9", reason: "" },
        { thread: "t1", choice: "s1", reason: "" },
        { thread: "t1", choice: "keep", reason: "Otra." },
      ],
      visible: new Set(["t1"]),
      batch: 2,
    });
    expect(r.events).toHaveLength(1);
    expect(book.positions.t1?.claude).toBe("s1");
  });
});

describe("apply", () => {
  const change = (
    thread: string,
    op: Change["op"],
    block: string,
    author: ModelId,
    text = "X.",
  ): Change => ({
    thread,
    op,
    block,
    author,
    text,
    sources: [],
    support: ["grok", "claude", "openai"],
  });

  test("one pass by paragraph ID returns the next version and leaves the input as it was", () => {
    const before = JSON.stringify(SNAP);
    const r = apply(
      SNAP,
      [
        change("t1", "replace", "p2", "grok", "Dos bien."),
        change("t2", "delete", "p3", "claude"),
        change("t3", "insert_after", "p3", "openai", "Cuatro."),
      ],
      4,
    );
    expect(JSON.stringify(SNAP)).toBe(before);
    expect(r.snapshot.version).toBe(2);
    expect(r.snapshot.order).toEqual(["p1", "p2", "p4"]);
    expect(r.snapshot.blocks.p2).toMatchObject({ text: "Dos bien.", status: "majority" });
    expect(r.created).toEqual({ t3: "p4" });
    expect(r.nextParagraph).toBe(5);
  });

  test("an insertion whose anchor was deleted goes after the closest paragraph before it", () => {
    const v2 = apply(SNAP, [change("t1", "delete", "p2", "grok")], 4).snapshot;
    const s = {
      id: "s9",
      thread: "t9",
      author: "gemini" as const,
      coAuthors: [],
      round: 2 as const,
      baseVersion: 1,
      target: { block: "p2" },
      op: "insert_after" as const,
      kind: "missing" as const,
      text: "Nuevo.",
      reason: "Falta.",
      sources: [],
    };
    expect(resolveAnchor([SNAP, v2], v2, s)).toBe("p1");
  });

  test("the same accepted changes give the same snapshot in any order", () => {
    const changes = [
      change("t1", "replace", "p1", "grok", "Uno bien."),
      change("t2", "insert_after", "p1", "gemini", "G."),
      change("t3", "insert_after", "p1", "claude", "C."),
      change("t4", "delete", "p2", "openai"),
      change("t5", "insert_after", "p3", "grok", "Fin."),
    ];
    const expected = apply(SNAP, changes, 4);
    fc.assert(
      fc.property(fc.shuffledSubarray(changes, { minLength: changes.length }), (shuffled) => {
        expect(apply(SNAP, shuffled, 4)).toEqual(expected);
      }),
    );
  });
});
