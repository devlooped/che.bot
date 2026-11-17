import { drive, startRun } from "@chebot/driver";
import { replay, selectAnswer } from "@chebot/protocol";
import { FakeProvider } from "@chebot/providers";
import { describe, expect, it } from "vitest";
import { LOCAL_RUN_CONFIG } from "./config.ts";
import { MARKERS, SCENARIO_QUESTION, scenario } from "./scenario.ts";

const SNAPSHOT_MODELS = {
  "panel.grok": { id: "spacexai/grok-4.7", effort: "low" },
  "panel.claude": { id: "anthropic/claude-opus-5.5", effort: "medium" },
  "panel.openai": { id: "openai/gpt-6.1-sol", effort: "medium" },
  "panel.gemini": { id: "google/gemini-4-argon", effort: "medium" },
  utility: { id: "anthropic/claude-haiku-5.5", effort: null },
};

describe("the scripted run of the local mode", () => {
  it("has every case the interface shows", async () => {
    const run = startRun(
      {
        id: "00000000-0000-4000-8000-000000000001",
        question: SCENARIO_QUESTION,
        mode: "thorough",
        models: SNAPSHOT_MODELS,
        config: LOCAL_RUN_CONFIG,
      },
      Date.now(),
    );
    const driven = await drive(run, { provider: new FakeProvider(scenario()) });
    const view = replay(driven.log);
    const types = driven.log.map((e) => e.type);
    expect(view.status).toBe("completed");
    const seeded = view.snapshots[0];
    const statuses = Object.values(seeded?.blocks ?? {}).map((b) =>
      b.kind === "paragraph" ? b.status : "",
    );
    expect(statuses).toEqual(["majority", "agreed", "contested", "contested", "majority"]);
    expect(Object.values(view.threads).map((t) => [t.id, t.state])).toEqual([
      ["t1", "accepted"],
      ["t2", "accepted"],
      ["t3", "accepted"],
      ["t4", "unresolved"],
    ]);
    expect(view.votes.some((v) => v.changed && v.voter === "openai")).toBe(true);
    expect(view.abstentions.map((a) => [a.seat, a.stage])).toEqual([["gemini", "round3"]]);
    expect(driven.log.some((e) => e.type === "snapshot.created" && e.cause === "edit")).toBe(true);
    expect(view.moments.some((m) => m.origin === "model")).toBe(true);
    expect(view.sources.length).toBeGreaterThanOrEqual(4);
    expect(types).toContain("suggestion.opened");
    const answer = selectAnswer(view);
    expect(answer?.dissent.map((d) => d.author)).toEqual(["grok"]);
  }, 60_000);
});

describe.concurrent("the markers of the local scenario", () => {
  const play = async (question: string) => {
    const run = startRun(
      {
        id: crypto.randomUUID(),
        question,
        mode: "thorough",
        models: SNAPSHOT_MODELS,
        config: LOCAL_RUN_CONFIG,
      },
      Date.now(),
    );
    const provider = new FakeProvider(scenario());
    return replay((await drive(run, { provider })).log);
  };

  it("fail: the first run of a question fails, the next one completes", async () => {
    const question = `${MARKERS.fail} ${SCENARIO_QUESTION} ${crypto.randomUUID()}`;
    const first = await play(question);
    expect(first.status).toBe("failed");
    expect(first.abstentions.map((a) => a.stage)).toEqual(Array(4).fill("drafting"));
    expect((await play(question)).status).toBe("completed");
  }, 60_000);

  it("fewDrafts: two answers, no discussion", async () => {
    const view = await play(`${MARKERS.fewDrafts} ${SCENARIO_QUESTION}`);
    expect(view.status).toBe("completed");
    expect(view.flags.fewDrafts).toBe(true);
    expect(view.drafts.map((d) => d.model)).toEqual(["claude", "openai"]);
    expect(Object.keys(view.threads)).toEqual([]);
    expect(selectAnswer(view)?.paragraphs.length).toBeGreaterThan(0);
  }, 60_000);

  it("budget: the budget ends before the rounds and the merged answer stays", async () => {
    const view = await play(`${MARKERS.budget} ${SCENARIO_QUESTION}`);
    expect(view.status).toBe("completed");
    expect(view.flags.budgetReached).toBe(true);
    expect(Object.keys(view.threads)).toEqual([]);
    expect(view.versions.map((v) => v.cause)).toEqual(["merge"]);
  }, 60_000);
});
