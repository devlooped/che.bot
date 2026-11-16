import {
  type ConfigOverrides,
  type LoggedEvent,
  type Mode,
  replay,
  selectAnswer,
} from "@chebot/protocol";
import { FakeProvider, type ModelSetting, resolveModels } from "@chebot/providers";
import { describe, expect, test } from "vitest";
import { drive, memoryLedger, startRun } from "./driver.ts";
import { CATALOG, catalogEntry, script } from "./fake-script.ts";

const T0 = 1_800_000_000_000;

/** A clock that moves 100 ms each time it is read: no test sleeps. */
function clock(start = T0) {
  let t = start;
  return () => {
    t += 100;
    return t;
  };
}

function newRun(
  mode: Mode = "thorough",
  config?: ConfigOverrides,
  models = resolveModels([], CATALOG),
) {
  return startRun(
    {
      id: "run-cli",
      question: "¿Cuál es la capital de Australia y cuánta gente vive ahí?",
      mode,
      models,
      ...(config ? { config } : {}),
    },
    T0,
  );
}

const stages = (log: readonly LoggedEvent[]) =>
  log.flatMap((e) => (e.type === "stage.changed" ? [e.stage] : []));

describe("a fake-provider thorough run", async () => {
  const provider = new FakeProvider(script());
  const events: LoggedEvent[] = [];
  const driven = await drive(newRun(), {
    provider,
    now: clock(),
    onEvent: (e) => events.push(e),
  });

  test("goes through every stage and completes", () => {
    expect(driven.done).toBe(true);
    expect(driven.state.status).toBe("completed");
    expect(stages(driven.log)).toEqual([
      "drafting",
      "merging",
      "round1",
      "round2",
      "round3",
      "editing",
      "done",
    ]);
  });

  test("every call key was requested exactly once, and the call log has each once", () => {
    expect(provider.repeated()).toEqual([]);
    const requested = provider.calls.map((c) => c.callKey).sort();
    expect(requested).toEqual(Object.keys(driven.state.calls).sort());
    expect(driven.calls.map((c) => c.key).sort()).toEqual(requested);
    const grok = driven.calls.find((c) => c.key === "draft:0:grok");
    expect(grok).toMatchObject({
      seat: "grok",
      model: "spacexai/grok-4.7",
      status: "ok",
      costUsd: 0.05,
      inputTokens: 100,
      outputTokens: 50,
    });
  });

  test("each seat calls the model of its role in the snapshot", () => {
    const models = driven.state.models;
    for (const c of provider.calls) {
      const seat = c.callKey.split(":")[2];
      const role = seat ? `panel.${seat}` : "utility";
      expect(c.model).toEqual(models[role]);
    }
  });

  test("events reach onEvent as they are appended, in order, once", () => {
    // run.started was appended by startRun, before the drive
    expect(events).toEqual(driven.log.slice(1));
    expect(new Set(driven.log.map((e) => e.key)).size).toBe(driven.log.length);
  });

  test("replaying the event log rebuilds the same final document", () => {
    const view = replay(driven.log);
    expect(view.snapshots).toEqual(driven.state.snapshots);
    expect(selectAnswer(view)).toEqual(selectAnswer(driven.state));
    expect(view.moments).toEqual(driven.state.moments);
  });

  test("a claim's URL that differs from the search result only by www. and a slash keeps its source", () => {
    const openai = driven.state.drafts.find((d) => d.model === "openai");
    expect(driven.state.claims[openai?.claims[0] ?? ""]?.sources).toEqual(["src1"]);
  });
});

test("a run uses its model snapshot after the settings change", async () => {
  const settings: ModelSetting[] = [
    { role: "panel.claude", modelId: "anthropic/claude-opus-5.5", effort: "medium" },
  ];
  const catalog = [...CATALOG, catalogEntry("anthropic/claude-sonnet-5.5")];
  const snapshot = resolveModels(settings, catalog);
  const provider = new FakeProvider(script());
  const stop = new AbortController();
  const first = await drive(newRun("thorough", undefined, snapshot), {
    provider,
    now: clock(),
    signal: stop.signal,
    onEvent: (e) => {
      if (e.type === "document.seeded") stop.abort();
    },
  });
  expect(first.done).toBe(false);

  // the admin changes the settings and a newer model appears in the catalog
  settings[0] = { role: "panel.claude", modelId: "anthropic/sonnet", effort: "high" };
  catalog.push(catalogEntry("anthropic/claude-opus-5.6"));
  expect(resolveModels(settings, catalog)["panel.claude"]).toEqual({
    id: "anthropic/claude-sonnet-5.5",
    effort: "high",
  });

  const before = provider.calls.length;
  const second = await drive(first, { provider, now: clock(T0 + 60_000) });
  expect(second.state.status).toBe("completed");
  const later = provider.calls.slice(before).filter((c) => c.callKey.endsWith(":claude"));
  expect(later.length).toBeGreaterThan(0);
  for (const c of later)
    expect(c.model).toEqual({ id: "anthropic/claude-opus-5.5", effort: "medium" });
});

test("a provider timeout and an invalid output become abstentions; the run completes with three models", async () => {
  const provider = new FakeProvider(
    script({
      "draft:0:grok": { kind: "timeout", costUsd: 0.01 },
      "round:1:openai": { output: { suggestions: [{ paragraph: "p1" }] }, costUsd: 0.02 },
    }),
  );
  const driven = await drive(newRun("thorough", { callTimeoutMs: { draft: 20 } }), {
    provider,
    now: clock(),
  });
  expect(driven.state.status).toBe("completed");
  expect(driven.state.drafts.map((d) => d.model)).toEqual(["claude", "openai", "gemini"]);
  expect(driven.state.flags.fewDrafts).toBe(false);
  expect(driven.state.abstentions).toEqual([
    { call: "draft:0:grok", seat: "grok", stage: "drafting", reason: "timeout" },
    { call: "round:1:openai", seat: "openai", stage: "round1", reason: "invalid" },
  ]);
  const grok = driven.calls.find((c) => c.key === "draft:0:grok");
  expect(grok).toMatchObject({ status: "abstained", reason: "timeout", costUsd: 0.01 });
  expect(grok?.error).toContain("timed out");
  expect(driven.calls.find((c) => c.key === "round:1:openai")).toMatchObject({
    status: "abstained",
    reason: "invalid",
    costUsd: 0.02,
  });
  expect(selectAnswer(driven.state)?.abstained.map((a) => a.call)).toEqual([
    "draft:0:grok",
    "round:1:openai",
  ]);
  expect(provider.repeated()).toEqual([]);
});

describe("the ledger", () => {
  test("a second drive of the same run with the same ledger makes no provider call and gives the same result", async () => {
    const ledger = memoryLedger();
    const first = await drive(newRun(), {
      provider: new FakeProvider(script()),
      ledger,
      now: clock(),
    });
    const again = new FakeProvider(script());
    const second = await drive(newRun(), { provider: again, ledger, now: clock() });
    expect(again.calls).toEqual([]);
    expect(second.state.snapshots).toEqual(first.state.snapshots);
    expect(selectAnswer(second.state)).toEqual(selectAnswer(first.state));
    expect(second.state.spentUsd).toBeCloseTo(first.state.spentUsd, 9);
    expect(second.calls).toEqual(first.calls);
  });

  test("a run interrupted between two steps resumes without repeating a finished call", async () => {
    const ledger = memoryLedger();
    const provider = new FakeProvider(script());
    const stop = new AbortController();
    const first = await drive(newRun(), {
      provider,
      ledger,
      now: clock(),
      signal: stop.signal,
      onEvent: (e) => {
        if (e.type === "stage.changed" && e.stage === "round2") stop.abort();
      },
    });
    expect(first.done).toBe(false);
    expect(first.state.stage).toBe("round2");
    const resumed = await drive(first, { provider, ledger, now: clock(T0 + 60_000) });
    expect(resumed.state.status).toBe("completed");
    expect(provider.repeated()).toEqual([]);
    expect(stages(resumed.log)).toEqual([
      "drafting",
      "merging",
      "round1",
      "round2",
      "round3",
      "editing",
      "done",
    ]);
  });

  test("a call already in the ledger is read, not made: a crash inside a step loses nothing paid", async () => {
    const ledger = memoryLedger();
    await drive(newRun(), { provider: new FakeProvider(script()), ledger, now: clock() });
    const partial = memoryLedger();
    const kept = ledger.entries.get("draft:0:grok");
    if (!kept) throw new Error("missing entry");
    await partial.put("draft:0:grok", kept);
    const provider = new FakeProvider(script());
    const driven = await drive(newRun(), { provider, ledger: partial, now: clock() });
    expect(driven.state.status).toBe("completed");
    expect(provider.calls.map((c) => c.callKey)).not.toContain("draft:0:grok");
    expect(partial.entries.size).toBe(Object.keys(driven.state.calls).length);
  });
});
