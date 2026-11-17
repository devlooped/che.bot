import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { selectAnswer } from "./answer.ts";
import { DEFAULT_CONFIG } from "./config.ts";
import { appendEvents, paymentConfirmedEvent, quotedEvent } from "./events.ts";
import {
  abstain,
  drive,
  eventsOf,
  ok,
  type Responder,
  SNAPSHOT_MODELS,
  scripted,
  T0,
} from "./fixtures.ts";
import { MODELS, type Paragraph } from "./model.ts";
import { chooseEditor, createRun, failRun, nextStep, reduce } from "./reducer.ts";
import { replay } from "./replay.ts";
import { clone, seededShuffle } from "./util.ts";

const text = (p: unknown) => (p as Paragraph).text;
const THOROUGH = DEFAULT_CONFIG.deadlineMs.thorough;

describe("a scripted thorough run", () => {
  const run = drive({ mode: "thorough" }, scripted);
  const { state, log } = run;

  test("goes through every stage and completes", () => {
    expect(state.status).toBe("completed");
    expect(eventsOf(log, "stage.changed").map((e) => e.stage)).toEqual([
      "drafting",
      "merging",
      "round1",
      "round2",
      "round3",
      "editing",
      "done",
    ]);
    expect(eventsOf(log, "run.completed")).toEqual([
      expect.objectContaining({ version: 4, spentUsd: state.spentUsd }),
    ]);
  });

  test("makes at most 17 calls to the panel, each once, with stable keys", () => {
    const keys = run.steps.flatMap((s) => s.calls.map((c) => c.key));
    expect(new Set(keys).size).toBe(keys.length);
    const panel = run.steps.flatMap((s) => s.calls.filter((c) => c.seat !== "utility"));
    expect(panel).toHaveLength(17);
    expect(keys).toEqual(
      expect.arrayContaining([
        "draft:0:grok",
        "merge:0",
        "round:1:claude",
        "dedupe:1",
        "round:3:gemini",
        "edit-check:0",
        "moments:2",
      ]),
    );
    expect(Object.keys(state.calls).sort()).toEqual([...keys].sort());
    expect(state.spentUsd).toBeCloseTo(4 * 0.05 + 12 * 0.02 + 0.02 + 8 * 0.001, 9);
  });

  test("drafts search, rounds do not; sources come only from the call's search", () => {
    for (const s of run.steps) {
      for (const c of s.calls) expect(c.search !== undefined).toBe(c.kind === "draft");
    }
    expect(state.sources.map((s) => [s.id, s.url, s.foundBy])).toEqual([
      ["src1", "https://example.org/canberra", "grok"],
      ["src2", "https://example.org/abs", "gemini"],
    ]);
    const grok = state.drafts.find((d) => d.model === "grok")?.claims ?? [];
    expect(grok.map((id) => state.claims[id]?.sources)).toEqual([["src1"], []]);
    expect(state.suggestions.s6?.sources).toEqual(["src1"]);
  });

  test("seeds version 1 with statuses derived by code", () => {
    const v1 = state.snapshots[0];
    expect(v1?.order).toEqual(["p1", "p2", "p3"]);
    expect(v1?.order.map((id) => (v1.blocks[id] as Paragraph).status)).toEqual([
      "contested",
      "contested",
      "agreed",
    ]);
  });

  test("resolves threads by the voting rule and applies them at round boundaries", () => {
    expect(
      Object.values(state.threads).map((t) => [t.id, t.lockKey, t.state, t.winner ?? null]),
    ).toEqual([
      ["t1", "p2", "accepted", "s1"],
      ["t2", "p3", "accepted", "s5"],
      ["t3", "p1", "accepted", "s3"],
      ["t4", "p3+gemini", "unresolved", null],
      ["t5", "p1+openai", "accepted", "s6"],
    ]);
    expect(state.suggestions.s1?.coAuthors).toEqual(["claude"]); // merged by code
    expect(state.suggestions.s3?.coAuthors).toEqual(["gemini"]); // merged by the utility model
    expect(state.threads.t2?.alternatives).toEqual(["s2", "s5"]); // p3 was locked: claude joined t2
    expect(state.rejected).toEqual(["s2"]);
    expect(state.snapshots.map((s) => s.order)).toEqual([
      ["p1", "p2", "p3"],
      ["p1", "p3"],
      ["p1", "p4", "p3"],
      ["p1", "p4", "p3"],
    ]);
    expect(
      eventsOf(log, "snapshot.created").map((e) => [e.snapshot.version, e.cause, e.threads]),
    ).toEqual([
      [2, "round", ["t1", "t3"]],
      [3, "round", ["t2", "t5"]],
      [4, "edit", []],
    ]);
  });

  test("a changed position needs a reason: openai's silent switch on t4 is ignored", () => {
    expect(state.positions.t4?.openai).toBe("keep");
    expect(state.votes.filter((v) => v.changed).map((v) => [v.voter, v.thread])).toEqual([
      ["grok", "t2"],
      ["openai", "t2"],
    ]);
  });

  test("the editor's rewrite that changes a claim is dropped, the other kept", () => {
    expect(state.edit).toMatchObject({ kept: ["p1"] });
    const v4 = state.snapshots[3];
    expect(text(v4?.blocks.p1)).toBe("Canberra, y no Sídney, es la capital de Australia.");
    expect(text(v4?.blocks.p3)).toBe(
      "En Canberra viven unas 460.000 personas, según el censo de 2021.",
    );
  });

  test("moments: at most 3 per batch, templates when the call fails", () => {
    const byBatch = new Map<number, string[]>();
    for (const m of state.moments)
      byBatch.set(m.batch, [...(byBatch.get(m.batch) ?? []), m.origin]);
    for (const origins of byBatch.values()) expect(origins.length).toBeLessThanOrEqual(3);
    const round1 = state.moments.filter((m) => m.origin === "template");
    expect(round1.map((m) => m.text)).toEqual([
      "Hay 4 propuestas de cambio sobre la mesa, de Grok, ChatGPT y Gemini.",
      "Claude y Gemini propusieron lo mismo que otro y suman su apoyo.",
    ]);
  });

  test("the answer: text, tallies, dissent notes, sources", () => {
    const answer = selectAnswer(state);
    expect(answer?.final).toBe(true);
    expect(answer?.paragraphs.map((p) => [p.id, p.status, p.tally])).toEqual([
      ["p1", "majority", { for: 3, of: 4 }],
      ["p4", "majority", { for: 3, of: 4 }],
      ["p3", "majority", { for: 3, of: 4 }],
    ]);
    expect(answer?.dissent).toEqual([
      expect.objectContaining({
        thread: "t4",
        state: "unresolved",
        author: "gemini",
        holders: ["claude", "gemini"],
      }),
    ]);
    expect(answer?.sources.map((s) => s.id)).toEqual(["src1", "src2"]); // p3 keeps its sources when replaced
    expect(answer?.abstained).toEqual([]);
    expect(selectAnswer(state, 1)?.text).toBe(
      "La capital de Australia es Canberra.\n\nAlgunos dicen que es Sídney.\n\nEn Canberra viven unas 460.000 personas.",
    );
  });

  test("replaying the event log alone rebuilds the documents, threads, suggestions and votes", () => {
    const view = replay(log);
    expect(view.snapshots).toEqual(state.snapshots);
    expect(view.threads).toEqual(state.threads);
    expect(view.suggestions).toEqual(state.suggestions);
    expect(view.positions).toEqual(state.positions);
    expect(view.votes).toEqual(state.votes);
    expect(view.rejected).toEqual(state.rejected);
    expect(view.sources).toEqual(state.sources);
    expect(view.claims).toEqual(state.claims);
    expect(view.drafts).toEqual(state.drafts);
    expect(view.flags).toEqual(state.flags);
    expect(view.moments).toEqual(state.moments);
    expect(view.status).toBe("completed");
    expect(selectAnswer(view)).toEqual(selectAnswer(state));
  });

  test("replay says why each version of the document exists, for the history of the text", () => {
    const view = replay(log);
    expect(view.versions.map((v) => v.version)).toEqual(state.snapshots.map((s) => s.version));
    expect(view.versions[0]).toEqual({ version: 1, cause: "merge", threads: [], round: null });
    const created = log.filter((e) => e.type === "snapshot.created");
    expect(view.versions.slice(1).map((v) => [v.cause, v.threads])).toEqual(
      created.map((e) => [e.cause, e.threads]),
    );
    for (const v of view.versions.filter((v) => v.cause === "round")) {
      const rounds = view.votes.filter((vote) => v.threads.includes(vote.thread));
      expect(v.round).toBe(Math.max(...rounds.map((vote) => vote.round)));
    }
  });

  test("replay is idempotent on the log order: seq decides", () => {
    expect(replay([...log].reverse()).snapshots).toEqual(state.snapshots);
  });
});

describe("determinism", () => {
  test("the same accepted suggestions give the same snapshot whatever order the responses arrive in", () => {
    const reference = drive({ mode: "thorough" }, scripted).state;
    fc.assert(
      fc.property(fc.array(fc.string(), { minLength: 20, maxLength: 20 }), (seeds) => {
        const permuted = drive({ mode: "thorough" }, scripted, {
          permute: (results, i) => seededShuffle(results, seeds[i] ?? ""),
        }).state;
        expect(permuted.snapshots).toEqual(reference.snapshots);
        expect(permuted).toEqual(reference);
      }),
      { numRuns: 30 },
    );
  });

  test("the same state gives the same calls with the same keys; reduce never changes its input", () => {
    const { before, steps } = drive({ mode: "thorough" }, scripted);
    for (const s of steps) {
      const state = before[s.id];
      if (!state) throw new Error("missing state");
      const again = nextStep(clone(state), T0 + 5000);
      expect(again).toEqual(nextStep(state, T0 + 5000));
      const frozen = JSON.stringify(state);
      reduce(state, s, [], T0 + 9000);
      expect(JSON.stringify(state)).toBe(frozen);
      // stored as text between steps: a JSON round trip gives the same state exactly
      expect(clone(state)).toStrictEqual(state);
    }
  });

  test("a stale step is refused", () => {
    const { before, steps } = drive({ mode: "quick" }, scripted);
    const [first, second] = steps;
    if (!first || !second) throw new Error("expected steps");
    const later = before[second.id];
    if (!later) throw new Error("missing state");
    expect(() => reduce(later, first, [], T0)).toThrow(/stale step/);
  });
});

describe("stopping rules", () => {
  test("quick mode: drafts and merge only; version 1 is the answer", () => {
    const { state, log } = drive({ mode: "quick" }, scripted);
    expect(state.status).toBe("completed");
    expect(eventsOf(log, "stage.changed").map((e) => e.stage)).toEqual([
      "drafting",
      "merging",
      "done",
    ]);
    expect(state.snapshots).toHaveLength(1);
    expect(state.rounds).toEqual([]);
  });

  test("thorough with nothing contested ends after the merge", () => {
    const agreed: Responder = (call, state) =>
      call.kind === "merge"
        ? ok(call, {
            paragraphs: [{ text: "Todo.", claims: Object.keys(state.claims) }],
            conflicts: [],
          })
        : scripted(call, state);
    const { state } = drive({ mode: "thorough" }, agreed);
    expect(state.rounds).toEqual([]);
    expect(state.status).toBe("completed");
  });

  test("a model that times out abstains and a quorum of 3 continues", () => {
    const silent: Responder = (call, state) =>
      call.seat === "openai" ? abstain(call, "timeout") : scripted(call, state);
    const { state, log } = drive({ mode: "thorough" }, silent);
    expect(state.status).toBe("completed");
    expect(state.flags).toMatchObject({ fewDrafts: false, quorumLost: false });
    expect(state.drafts.map((d) => d.model)).toEqual(["grok", "claude", "gemini"]);
    expect(state.rounds.map((r) => r.answered)).toEqual([
      ["grok", "claude", "gemini"],
      ["grok", "claude", "gemini"],
      ["grok", "claude", "gemini"],
    ]);
    expect(
      eventsOf(log, "model.status")
        .filter((e) => e.status === "abstained")
        .map((e) => e.call),
    ).toEqual(["draft:0:openai", "round:1:openai", "round:2:openai", "round:3:openai"]);
    expect(selectAnswer(state)?.abstained.map((a) => [a.model, a.stage, a.reason])).toEqual([
      ["openai", "drafting", "timeout"],
      ["openai", "round1", "timeout"],
      ["openai", "round2", "timeout"],
      ["openai", "round3", "timeout"],
    ]);
    // coverage is checked against the drafts that arrived
    expect(state.flags.mergeFallback).toBeNull();
  });

  test("an invalid output is an abstention, not a retry", () => {
    const invalid: Responder = (call, state) =>
      call.key === "draft:0:gemini" ? ok(call, { answer: 42 }) : scripted(call, state);
    const { state } = drive({ mode: "quick" }, invalid);
    expect(state.calls["draft:0:gemini"]).toMatchObject({
      status: "abstained",
      reason: "invalid",
      costUsd: 0.02,
    });
    expect(state.drafts).toHaveLength(3);
  });

  test("fewer than 3 drafts: merge what arrived, skip the rounds, flag it", () => {
    const two: Responder = (call, state) =>
      call.kind === "draft" && (call.seat === "openai" || call.seat === "gemini")
        ? abstain(call)
        : scripted(call, state);
    const { state, log } = drive({ mode: "thorough" }, two);
    expect(state.status).toBe("completed");
    expect(state.flags.fewDrafts).toBe(true);
    expect(state.rounds).toEqual([]);
    expect(eventsOf(log, "stage.changed").map((e) => e.stage)).toEqual([
      "drafting",
      "merging",
      "done",
    ]);
    expect(eventsOf(log, "run.completed")[0]?.flags.fewDrafts).toBe(true);
  });

  test("no draft at all: the run fails", () => {
    const none: Responder = (call, state) =>
      call.kind === "draft" ? abstain(call) : scripted(call, state);
    const { state, log } = drive({ mode: "thorough" }, none);
    expect(state.status).toBe("failed");
    expect(state.failure).toBe("no_drafts");
    expect(eventsOf(log, "run.failed")).toHaveLength(1);
    expect(eventsOf(log, "stage.changed").at(-1)?.stage).toBe("failed");
    expect(nextStep(state, T0)).toEqual({ kind: "done" });
  });

  test("a driver error fails a running run once; an ended run is left as it is", () => {
    const { state: started } = createRun(
      { id: "run-1", question: "?", mode: "thorough", models: SNAPSHOT_MODELS },
      T0,
    );
    const failed = failRun(started, "error", T0 + 5);
    expect(failed.state.status).toBe("failed");
    expect(failed.state.failure).toBe("error");
    expect(failed.events.map((e) => e.type)).toEqual(["stage.changed", "run.failed"]);
    expect(started.status).toBe("running");
    expect(failRun(failed.state, "error", T0 + 6).events).toEqual([]);
    expect(nextStep(failed.state, T0 + 6)).toEqual({ kind: "done" });
  });

  test("a second run.started in the log is a new attempt: replay keeps the payment and drops the first attempt", () => {
    const none: Responder = (call, state) =>
      call.kind === "draft" ? abstain(call) : scripted(call, state);
    const first = drive({ mode: "thorough" }, none);
    const second = drive({ mode: "thorough" }, scripted);
    const paidEvents = [
      quotedEvent({ class: "simple", probability: 0.9, amount: 5000, currency: "ARS" }),
      paymentConfirmedEvent({ amount: 5000, currency: "ARS" }),
    ];
    let log = appendEvents([], paidEvents, T0).log;
    log = appendEvents(log, first.log, T0).log;
    const again = second.log.map((e) => ({ ...e, key: `a2:${e.key}` }));
    log = appendEvents(log, again, T0).log;
    const view = replay(log);
    expect(view.status).toBe("completed");
    expect(view.paid).toBe(true);
    expect(view.quote?.amount).toBe(5000);
    expect(view.snapshots).toEqual(second.state.snapshots);
    expect(view.drafts).toEqual(second.state.drafts);
    expect(selectAnswer(view)).toEqual(selectAnswer(second.state));
  });

  test("a merge that fails falls back to a code-built document, without retry", () => {
    const noMerge: Responder = (call, state) =>
      call.kind === "merge" ? abstain(call, "invalid") : scripted(call, state);
    const { state, steps } = drive({ mode: "quick" }, noMerge);
    expect(steps.filter((s) => s.phase === "merge")).toHaveLength(1);
    expect(state.flags.mergeFallback).toBe("no_merge");
    expect(
      Object.values(state.snapshots[0]?.blocks ?? {})
        .flatMap((b) => (b as Paragraph).claims)
        .sort(),
    ).toEqual(Object.keys(state.claims).sort());
  });

  test("budget: no room for the drafts fails the run before any call", () => {
    const { state, steps } = drive({ mode: "thorough", config: { budgetUsd: 0.5 } }, scripted);
    expect(steps.flatMap((s) => s.calls)).toEqual([]);
    expect(state).toMatchObject({ status: "failed", failure: "budget" });
  });

  test("budget: a round that does not fit closes the rounds with what exists", () => {
    const { state, log, steps } = drive(
      {
        mode: "thorough",
        config: { budgetUsd: 1, worstCaseUsd: { draft: 0.1, round1: 0.1, round2: 0.3 } },
      },
      scripted,
    );
    expect(state.rounds.map((r) => r.round)).toEqual([1]);
    expect(steps.some((s) => s.calls.some((c) => c.kind === "round2"))).toBe(false);
    expect(state.flags.budgetReached).toBe(true);
    expect(eventsOf(log, "stage.changed").at(-1)).toMatchObject({ stage: "done", cut: "budget" });
    // round 1 threads end for good: none had 2 other holders
    expect(Object.values(state.threads).map((t) => t.state)).toEqual([
      "unresolved",
      "unresolved",
      "unresolved",
      "unresolved",
    ]);
    expect(selectAnswer(state)?.dissent.length).toBeGreaterThan(0);
  });

  test("budget: no room for the editor ends the run without the editor pass", () => {
    const { state, log } = drive(
      {
        mode: "thorough",
        config: {
          budgetUsd: 0.6,
          worstCaseUsd: { draft: 0.06, round1: 0.03, round2: 0.03, round3: 0.03, editor: 0.3 },
        },
      },
      scripted,
    );
    expect(state.rounds.map((r) => r.round)).toEqual([1, 2, 3]);
    expect(state.edit).toBeNull();
    expect(state.flags.budgetReached).toBe(true);
    expect(
      eventsOf(log, "stage.changed")
        .map((e) => e.stage)
        .at(-1),
    ).toBe("done");
    expect(state.snapshots.map((s) => s.version)).toEqual([1, 2, 3]);
  });

  test("budget: a spent budget means template moments", () => {
    const { state } = drive(
      { mode: "quick", config: { budgetUsd: 0.203, worstCaseUsd: { draft: 0.05, merge: 0.001 } } },
      scripted,
    );
    expect(state.moments.map((m) => m.origin)).toEqual(["template", "template", "template"]);
    expect(state.moments.map((m) => m.text)).toContain(
      "Los cuatro ya tienen su propia respuesta, cada uno por su cuenta.",
    );
  });

  test("deadline: a round that cannot end in time goes to the editor pass with what exists", () => {
    // round 1 ends less than a round, an editor pass or a utility call before the deadline
    const slowRound1 = (s: { phase: string; stage: string }) =>
      s.phase === "round" && s.stage === "round1" ? THOROUGH - 50_000 : 1000;
    const { state, log } = drive({ mode: "thorough" }, scripted, { tick: slowRound1 });
    expect(state.rounds.map((r) => r.round)).toEqual([1]);
    expect(state.flags.deadlineReached).toBe(true);
    expect(eventsOf(log, "stage.changed").find((e) => e.cut)).toMatchObject({
      stage: "done",
      cut: "deadline",
    });
    // after the deadline the moments are not phrased by a call
    expect(state.moments.filter((m) => m.batch >= 3).every((m) => m.origin === "template")).toBe(
      true,
    );
  });

  test("deadline: accepted changes are applied, without an editor pass that would end after it", () => {
    // three models propose the same deletion in round 1: accepted when the rounds end
    const unanimous: Responder = (call, state) =>
      call.kind === "round1"
        ? ok(call, {
            suggestions:
              call.seat === "gemini"
                ? []
                : [
                    {
                      paragraph: "p2",
                      op: "delete",
                      kind: "wrong",
                      text: "",
                      reason: "Es falso.",
                      sources: [],
                    },
                  ],
          })
        : scripted(call, state);
    const tick = (s: { phase: string; stage: string }) =>
      s.phase === "round" ? THOROUGH - 50_000 : 1000;
    const { state, log } = drive({ mode: "thorough" }, unanimous, { tick });
    expect(eventsOf(log, "stage.changed").find((e) => e.cut)).toMatchObject({
      stage: "done",
      cut: "deadline",
    });
    expect(state.threads.t1?.state).toBe("accepted");
    expect(state.snapshots.at(-1)?.order).not.toContain("p2");
    expect(state.edit).toBeNull();
    expect(state.status).toBe("completed");
  });

  test("deadline: the editor pass runs only if it and its check end before the deadline", () => {
    // The editor (3 min) and its check (1 min) need 4 min. Round 3 ends 5 s past the last moment
    // that leaves them room in one run, 20 s before it in the other.
    const { editor, utility } = DEFAULT_CONFIG.callTimeoutMs;
    const last = THOROUGH - editor - utility;
    const tick = (s: { phase: string; stage: string }) =>
      s.phase === "round" && s.stage === "round3" ? last - 5_000 : 1000;
    const late = drive({ mode: "thorough" }, scripted, { tick });
    expect(late.state.edit).toBeNull();
    expect(late.state.flags.deadlineReached).toBe(true);
    expect(late.steps.flatMap((s) => s.calls.map((c) => c.kind))).not.toContain("editor");
    const inTime = drive({ mode: "thorough" }, scripted, {
      tick: (s) => (s.phase === "round" && s.stage === "round3" ? last - 20_000 : 1000),
    });
    expect(inTime.state.edit?.editor).toBeDefined();
  });

  test("deadline: with every call at its full timeout, a run still goes through every stage", () => {
    const full = (s: { calls: { timeoutMs: number }[] }) =>
      Math.max(1000, ...s.calls.map((c) => c.timeoutMs));
    const thorough = drive({ mode: "thorough" }, scripted, { tick: full });
    expect(eventsOf(thorough.log, "stage.changed").map((e) => [e.stage, e.cut])).toEqual(
      ["drafting", "merging", "round1", "round2", "round3", "editing", "done"].map((stage) => [
        stage,
        null,
      ]),
    );
    expect(thorough.state.flags.deadlineReached).toBe(false);
    // no call was shortened by the deadline
    const timeouts = Object.values(DEFAULT_CONFIG.callTimeoutMs);
    for (const c of thorough.steps.flatMap((s) => s.calls)) expect(timeouts).toContain(c.timeoutMs);
    const quick = drive({ mode: "quick" }, scripted, { tick: full });
    expect(quick.state.status).toBe("completed");
    expect(quick.state.flags.deadlineReached).toBe(false);
  });

  test("deadline: no call outlives it; the merge gets the time that is left", () => {
    const quick = DEFAULT_CONFIG.deadlineMs.quick;
    const drafts = quick - 100_000; // less than a merge (3 min) is left
    const tick = (s: { phase: string }) => (s.phase === "draft" ? drafts : 1000);
    const { steps, state } = drive({ mode: "quick" }, scripted, { tick });
    const merge = steps.find((s) => s.phase === "merge")?.calls[0];
    expect(merge?.timeoutMs).toBe(quick - drafts);
    const draft = steps.find((s) => s.phase === "draft")?.calls[0];
    expect(draft?.timeoutMs).toBe(state.config.callTimeoutMs.draft);
  });

  test("round 1 without suggestions ends the run", () => {
    const quiet: Responder = (call, state) =>
      call.kind === "round1" ? ok(call, { suggestions: [] }) : scripted(call, state);
    const { state, log } = drive({ mode: "thorough" }, quiet);
    expect(state.rounds.map((r) => r.round)).toEqual([1]);
    expect(eventsOf(log, "stage.changed").map((e) => e.stage)).toEqual([
      "drafting",
      "merging",
      "round1",
      "done",
    ]);
  });

  test("early stop: a round with no new suggestion and no changed position ends the rounds", () => {
    const still: Responder = (call, state) =>
      call.kind === "round2"
        ? ok(call, {
            votes: [{ thread: "t4", choice: call.seat === "claude" ? "s4" : "keep", reason: "" }],
            suggestions: [],
          })
        : scripted(call, state);
    const { state } = drive({ mode: "thorough" }, still);
    expect(state.rounds.map((r) => [r.round, r.newSuggestions, r.changedPositions])).toEqual([
      [1, 4, 0],
      [2, 0, 0],
    ]);
    expect(state.threads.t4?.state).toBe("unresolved");
    expect(state.status).toBe("completed");
  });

  test("a round answered by fewer than 3 models ends the rounds", () => {
    const thin: Responder = (call, state) =>
      call.kind === "round2" && call.seat !== "grok" && call.seat !== "claude"
        ? abstain(call)
        : scripted(call, state);
    const { state } = drive({ mode: "thorough" }, thin);
    expect(state.rounds.map((r) => r.round)).toEqual([1, 2]);
    expect(state.flags.quorumLost).toBe(true);
    expect(Object.values(state.threads).every((t) => t.state !== "open")).toBe(true);
  });
});

describe("the editor", () => {
  test("the policy is read when the editing step is computed, so a cloned state can finish both ways", () => {
    const { before, steps } = drive({ mode: "thorough", id: "run-7" }, scripted);
    const edit = steps.find((s) => s.phase === "edit");
    const atEdit = edit ? before[edit.id] : undefined;
    if (!edit || !atEdit) throw new Error("no editing step");
    const closest = nextStep(atEdit, T0);
    const rotated = clone(atEdit);
    rotated.config.editorPolicy = "rotation";
    const rotation = nextStep(rotated, T0);
    if (closest.kind !== "calls" || rotation.kind !== "calls") throw new Error("expected calls");
    expect(closest.calls[0]?.seat).toBe(chooseEditor(atEdit, "closest"));
    expect(rotation.calls[0]?.seat).toBe(chooseEditor(atEdit, "rotation"));
  });

  test("closest: the model whose claims are most in agreed and majority paragraphs; ties by rotation", () => {
    const { state } = drive({ mode: "thorough" }, scripted);
    // v1: only p3 is not contested and carries one claim of each model: a four-way tie
    expect(chooseEditor(state, "closest")).toBe(chooseEditor(state, "rotation"));
    const leaning = clone(state);
    const p1 = leaning.snapshots[0]?.blocks.p1 as Paragraph;
    p1.status = "majority";
    expect(chooseEditor(leaning, "closest")).not.toBe("gemini");
    const rotations = new Set(
      ["a", "b", "c", "d", "e", "f", "g", "h"].map((id) =>
        chooseEditor({ ...state, id }, "rotation"),
      ),
    );
    expect(rotations.size).toBeGreaterThan(1);
    expect(MODELS).toEqual(expect.arrayContaining([...rotations]));
  });
});
