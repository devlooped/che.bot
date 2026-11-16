import { describe, expect, test } from "vitest";
import { appendEvents, paymentRequestedEvent, quotedEvent, type RunEvent } from "./events.ts";
import { drive, scripted } from "./fixtures.ts";
import { momentFacts, templateMoments } from "./moments.ts";
import { nextStep, reviewerLabels } from "./reducer.ts";
import { replay } from "./replay.ts";

const ev = (e: Record<string, unknown>) => ({ key: String(e.type), batch: 1, ...e }) as RunEvent;

describe("template moments", () => {
  test("at most 3 sentences, most important first, in rioplatense Spanish", () => {
    const events = [
      ev({ type: "stage.changed", stage: "done", from: "round2", cut: "budget" }),
      ev({
        type: "model.status",
        model: "grok",
        status: "abstained",
        call: "round:2:grok",
        stage: "round2",
        reason: "timeout",
      }),
      ev({
        type: "vote.cast",
        thread: "t1",
        model: "claude",
        round: 2,
        choice: "s1",
        changed: true,
        reason: "Ok.",
      }),
      ev({
        type: "thread.unresolved",
        thread: "t1",
        why: "no_majority",
        tally: { for: [], against: [], none: [] },
      }),
    ];
    expect(templateMoments(events)).toEqual([
      "Se terminó el presupuesto de esta pregunta, así que cerramos con lo que hay.",
      "Grok no llegó a contestar esta vez y sigue el resto.",
      "En un punto no hubo acuerdo y queda anotado al margen.",
    ]);
    expect(templateMoments([])).toEqual([]);
  });

  test("the facts for the utility call name what happened, without ids", () => {
    const facts = momentFacts(
      [
        ev({
          type: "vote.cast",
          thread: "t1",
          model: "openai",
          round: 3,
          choice: "s1",
          changed: true,
          reason: "El censo lo confirma.",
        }),
      ],
      {},
    );
    expect(facts).toEqual(["ChatGPT changed position, because: El censo lo confirma."]);
  });
});

describe("prompts", () => {
  const { before, steps } = drive({ mode: "thorough" }, scripted);
  const at = (phase: string, stage?: string) => {
    const s = steps.find((x) => x.phase === phase && (!stage || x.stage === stage));
    const state = s ? before[s.id] : undefined;
    if (!s || !state) throw new Error(`no ${phase} step`);
    return { step: s, state };
  };

  test("every prompt tells the model to answer in the language of the question", () => {
    for (const s of steps) {
      for (const c of s.calls) {
        if (
          c.kind === "draft" ||
          c.kind === "merge" ||
          c.kind.startsWith("round") ||
          c.kind === "editor"
        ) {
          expect(c.system).toMatch(/language of the question/);
        }
      }
    }
  });

  test("drafts are independent; rounds explain substance only, the cap and the reason rule", () => {
    const draft = at("draft").step.calls[0];
    expect(draft?.system).toMatch(/alone/);
    const r2 = at("round", "round2").step.calls[0];
    expect(r2?.system).toMatch(/Substance only/);
    expect(r2?.system).toMatch(/At most 2 suggestions/);
    expect(r2?.system).toMatch(/one-sentence reason/);
    expect(r2?.system).toMatch(/Paragraphs .*p3.* are locked/);
    expect(at("round", "round3").step.calls[0]?.system).not.toMatch(/Suggestions:/);
  });

  test("other models' positions are anonymized, with labels shuffled per thread", () => {
    const { step } = at("round", "round3");
    for (const c of step.calls) {
      for (const name of [
        "grok",
        "claude",
        "openai",
        "gemini",
        "Grok",
        "Claude",
        "Gemini",
        "ChatGPT",
      ]) {
        expect(c.prompt).not.toContain(name);
      }
      expect(c.prompt).toMatch(/Reviewer [ABC]: /);
    }
    const perThread = ["t1", "t2", "t3", "t4", "t5", "t6"].map(
      (t) => reviewerLabels("run-1", t, "grok").claude,
    );
    expect(new Set(perThread).size).toBeGreaterThan(1);
    expect(reviewerLabels("run-1", "t2", "grok")).toEqual(reviewerLabels("run-1", "t2", "grok"));
  });

  test("the editor is told: no change of substance; the check compares claims", () => {
    expect(at("edit").step.calls[0]?.system).toMatch(/No change of substance/);
    const check = at("edit_check").step.calls[0];
    expect(check?.prompt).toContain("Rewrite:");
  });

  test("moments are asked in the interface language", () => {
    const { state } = at("moments");
    const step = nextStep(state, state.startedAt);
    if (step.kind !== "calls") throw new Error("expected calls");
    expect(step.calls[0]?.system).toMatch(/rioplatense/);
  });
});

describe("events", () => {
  test("appending assigns seq and time, and skips keys already in the log", () => {
    const first = appendEvents(
      [],
      [
        quotedEvent({
          class: "complex",
          probability: 0.9,
          mode: "thorough",
          prices: {
            quick: { amount: 500, currency: "ARS" },
            thorough: { amount: 1500, currency: "ARS" },
          },
        }),
      ],
      10,
    );
    const second = appendEvents(
      first.log,
      [
        paymentRequestedEvent({ mode: "thorough", amount: 1500, currency: "ARS", qr: "000201" }),
        first.log[0] as RunEvent,
      ],
      20,
    );
    expect(second.appended.map((e) => [e.seq, e.key, e.at])).toEqual([
      [2, "payment.requested", 20],
    ]);
    const view = replay(second.log);
    expect(view).toMatchObject({
      status: "awaiting_payment",
      payment: { amount: 1500, qr: "000201" },
    });
  });

  test("every event of a run has a unique key and a batch", () => {
    const { log } = drive({ mode: "thorough" }, scripted);
    expect(new Set(log.map((e) => e.key)).size).toBe(log.length);
    expect(log.every((e, i) => e.seq === i + 1 && Number.isInteger(e.batch))).toBe(true);
    const batches = log.map((e) => e.batch);
    expect([...batches].sort((a, b) => a - b)).toEqual(batches);
  });
});
