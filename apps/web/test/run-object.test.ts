import { abortAllDurableObjects, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { drive, memoryLedger, runCalls, startRun } from "@chebot/driver";
import { CATALOG, catalogEntry, script } from "@chebot/driver/testing";
import {
  beginStep,
  type LoggedEvent,
  nextStep,
  quotedEvent,
  replay,
  selectAnswer,
} from "@chebot/protocol";
import { FakeProvider, resolveModels } from "@chebot/providers";
import { describe, expect, test } from "vitest";
import { overrideDeps } from "../src/worker/deps.ts";
import { type RunObject, runStub } from "../src/worker/run-object.ts";
import { attemptPrefix, RunStore } from "../src/worker/run-store.ts";
import { eventsOf, fakes, HOOK_URL, paidRun, QUESTION, quoted, runAlarms } from "./helpers.ts";

type Stub = DurableObjectStub<RunObject>;

/** The storage of a run, read inside its object. */
const inside = <R>(stub: Stub, read: (store: RunStore) => R) =>
  runInDurableObject(stub, (_instance: RunObject, state) => read(new RunStore(state.storage.sql)));

/** Runs single ticks until the next step of the stored state is in `stage`. */
async function tickUntil(stub: Stub, stage: string) {
  for (let n = 0; n < 30; n++) {
    const next = await inside(stub, (store) => {
      const state = store.run()?.state;
      return state ? nextStep(state, Date.now()) : null;
    });
    if (next?.kind === "calls" && next.stage === stage && next.phase === "round") return next;
    if (!(await runDurableObjectAlarm(stub))) break;
  }
  throw new Error(`the run never reached ${stage}`);
}

/** The same question driven by the CLI driver, with the same fake models. */
async function cliRun(id: string) {
  return drive(
    startRun(
      { id, question: QUESTION, mode: "thorough", models: resolveModels([], CATALOG) },
      1_800_000_000_000,
    ),
    { provider: new FakeProvider(script()) },
  );
}

const keysAfterStart = (log: readonly LoggedEvent[]) =>
  log.slice(log.findIndex((e) => e.type === "run.started")).map((e) => `${e.type}|${e.key}`);

describe("quote, pay and paid", () => {
  test("each is safe to call twice; no panel call is made before paid()", async () => {
    const { provider } = fakes();
    const { id, stub } = await quoted("owner-qpp");
    const again = await stub.quote({
      id,
      owner: "someone-else",
      question: "another question",
      class: "simple",
      probability: 0.99,
      amount: 5000,
      currency: "ARS",
    });
    expect(again).toMatchObject({ question: QUESTION, class: "complex", amount: 10000 });
    expect(await stub.owner()).toBe("owner-qpp");
    expect((await eventsOf(stub)).map((e) => e.type)).toEqual(["run.quoted"]);
    const listed = await env.DB.prepare("SELECT owner, status FROM runs WHERE id = ?")
      .bind(id)
      .all();
    expect(listed.results).toEqual([{ owner: "owner-qpp", status: "quoted" }]);

    await stub.pay({ hookUrl: HOOK_URL, free: false });
    const paying = await inside(stub, (store) => store.run());
    expect(await stub.pay({ hookUrl: HOOK_URL, free: false })).toMatchObject({
      ok: true,
      summary: { status: "awaiting_payment" },
    });
    expect(await inside(stub, (store) => store.run())).toEqual(paying);
    // The alarm enqueues the job and shows its QR; no model is called.
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect(provider.calls).toEqual([]);

    const started = await stub.paid();
    expect(started?.status).toBe("running");
    const log = await eventsOf(stub);
    expect(log.map((e) => e.type)).toEqual([
      "run.quoted",
      "payment.requested",
      "payment.confirmed",
      "run.started",
    ]);
    expect(await stub.paid()).toEqual(started);
    expect(await eventsOf(stub)).toEqual(log);
    expect(provider.calls).toEqual([]);

    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect(provider.calls.map((c) => c.callKey).sort()).toEqual([
      "draft:0:claude",
      "draft:0:gemini",
      "draft:0:grok",
      "draft:0:openai",
    ]);
    const { results } = await env.DB.prepare("SELECT status FROM runs WHERE id = ?").bind(id).all();
    expect(results).toEqual([{ status: "running" }]);
  });

  test("paid() on a run that is not waiting for payment starts nothing", async () => {
    const { provider } = fakes();
    const { stub } = await quoted();
    expect((await stub.paid())?.status).toBe("quoted");
    expect(await runDurableObjectAlarm(stub)).toBe(false);
    expect(provider.calls).toEqual([]);
  });

  test("appending an event twice is a no-op", async () => {
    fakes();
    const { stub } = await quoted();
    const event = quotedEvent({ class: "simple", probability: 1, amount: 1, currency: "ARS" });
    const { first, second, count } = await inside(stub, (store) => ({
      first: store.append([{ ...event, key: "test.once" }], 1),
      second: store.append([{ ...event, key: "test.once" }], 2),
      count: store.events().length,
    }));
    expect(first).toHaveLength(1);
    expect(second).toEqual([]);
    expect(count).toBe(2);
  });
});

describe("the alarm driver", () => {
  test("a full fake run through the alarms ends with the same document as the CLI driver", async () => {
    const { provider } = fakes();
    const { id, stub } = await paidRun();
    await runAlarms(stub);
    expect(provider.repeated()).toEqual([]);
    const log = await eventsOf(stub);
    const view = replay(log);
    const cli = await cliRun(id);
    expect(cli.state.status).toBe("completed");
    expect(view.status).toBe("completed");
    expect(view.snapshots).toEqual(cli.state.snapshots);
    expect(selectAnswer(view)).toEqual(selectAnswer(cli.state));
    expect(keysAfterStart(log)).toEqual(keysAfterStart(cli.log));
    const stored = await inside(stub, (store) => store.run()?.state);
    expect(selectAnswer(stored ?? cli.state)).toEqual(selectAnswer(cli.state));
    const summary = await stub.summary();
    expect(summary).toMatchObject({ status: "completed", stage: "done", version: 4 });
    expect(await stub.snapshot(4)).toEqual(cli.state.snapshots.at(-1));
    expect(await stub.snapshot(1)).toEqual(cli.state.snapshots[0]);
    const { results } = await env.DB.prepare("SELECT status FROM runs WHERE id = ?").bind(id).all();
    expect(results).toEqual([{ status: "completed" }]);
  });

  test("the summary names the stage of the step in flight, before its state is stored", async () => {
    fakes();
    const { stub } = await paidRun();
    expect(await stub.summary()).toMatchObject({ status: "running", stage: null });
    // What a tick does when a step begins: the stage event lands, the calls are still in flight.
    await inside(stub, (store) => {
      const run = store.run();
      if (!run?.state) throw new Error("no state");
      const step = nextStep(run.state, Date.now());
      store.append(beginStep(run.state, step), Date.now(), attemptPrefix(run.attempt));
    });
    expect(await inside(stub, (store) => store.run()?.state?.stage)).toBeNull();
    expect(await stub.summary()).toMatchObject({ status: "running", stage: "drafting" });
  });

  test("a second alarm for the same stage repeats no finished call", async () => {
    const { provider } = fakes();
    const { stub } = await paidRun();
    const before = await inside(stub, (store) => store.run()?.state);
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect(provider.calls).toHaveLength(4);
    // The calls of the drafting stage landed, then the commit was lost: the alarm runs again.
    await inside(stub, (store) => {
      store.updateRun({ state: JSON.stringify(before) });
    });
    await runInDurableObject(stub, (instance: RunObject) => instance.alarm());
    expect(provider.calls).toHaveLength(4);
    expect(await inside(stub, (store) => store.run()?.state?.drafts.length)).toBe(4);
    await runAlarms(stub);
    expect(provider.repeated()).toEqual([]);
    expect((await stub.summary())?.status).toBe("completed");
  });

  test("a restart in the middle of a round loses no finished call, and retries the cut one once", async () => {
    const { provider } = fakes();
    const { id, stub: first } = await paidRun();
    const round = await tickUntil(first, "round1");
    const state = await inside(first, (store) => store.run()?.state);
    if (!state) throw new Error("no state");
    // Before the restart, claude and openai answered and their results were stored; grok's
    // request was on its way; gemini's had not started.
    const landed = await runCalls(
      state,
      { ...round, calls: round.calls.filter((c) => c.seat === "claude" || c.seat === "openai") },
      { provider: new FakeProvider(script()), ledger: memoryLedger(), now: Date.now },
    );
    await inside(first, async (store) => {
      const ledger = store.ledger("");
      for (const entry of landed) await ledger.put(entry.result.key, entry);
      await ledger.begin?.("round:1:grok", Date.now());
    });
    // The restart: the instance goes, its storage and its alarm stay.
    await abortAllDurableObjects();
    const stub = runStub(env, id);
    const before = provider.calls.length;
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect(
      provider.calls
        .slice(before)
        .map((c) => c.callKey)
        .sort(),
    ).toEqual(["round:1:gemini", "round:1:grok"]);
    expect(
      await inside(stub, (store) => store.calls().find((c) => c.key === "round:1:grok")),
    ).toEqual({ key: "round:1:grok", status: "ok", attempts: 2 });
    await runAlarms(stub);
    expect(provider.repeated()).toEqual([]);
    const view = replay(await eventsOf(stub));
    expect(selectAnswer(view)).toEqual(selectAnswer((await cliRun(id)).state));
  });

  test("a call cut short twice abstains without a request, and the run goes on", async () => {
    const { provider } = fakes();
    const { stub } = await paidRun();
    await tickUntil(stub, "round1");
    await inside(stub, async (store) => {
      const ledger = store.ledger("");
      await ledger.begin?.("round:1:grok", Date.now());
      await ledger.begin?.("round:1:grok", Date.now());
    });
    await runAlarms(stub);
    expect(provider.calls.map((c) => c.callKey)).not.toContain("round:1:grok");
    const abstained = (await eventsOf(stub)).filter(
      (e) => e.type === "model.status" && e.status === "abstained",
    );
    expect(abstained).toMatchObject([
      { model: "grok", call: "round:1:grok", stage: "round1", reason: "error" },
    ]);
    expect((await stub.summary())?.status).toBe("completed");
  });

  test("a model that times out abstains and the run completes with three models", async () => {
    const { provider } = fakes({
      calls: { "draft:0:grok": { kind: "timeout" } },
      config: { callTimeoutMs: { draft: 50 } },
    });
    const { stub } = await paidRun();
    await runAlarms(stub);
    const log = await eventsOf(stub);
    expect(log.filter((e) => e.type === "model.status" && e.status === "abstained")).toMatchObject([
      { model: "grok", call: "draft:0:grok", stage: "drafting", reason: "timeout" },
    ]);
    const view = replay(log);
    expect(view.status).toBe("completed");
    expect(view.drafts.map((d) => d.model)).toEqual(["claude", "openai", "gemini"]);
    expect(provider.repeated()).toEqual([]);
    expect(
      await inside(stub, (store) => store.calls().find((c) => c.key === "draft:0:grok")),
    ).toEqual({ key: "draft:0:grok", status: "abstained", attempts: 1 });
  });

  test("an exhausted budget cuts the rounds as the protocol defines", async () => {
    const { provider } = fakes({ config: { budgetUsd: 1, worstCaseUsd: { round1: 0.5 } } });
    const { stub } = await paidRun();
    await runAlarms(stub);
    const log = await eventsOf(stub);
    expect(provider.calls.some((c) => c.callKey.startsWith("round:"))).toBe(false);
    expect(log.some((e) => e.type === "stage.changed" && e.cut === "budget")).toBe(true);
    const view = replay(log);
    expect(view.status).toBe("completed");
    expect(view.flags.budgetReached).toBe(true);
    expect(view.snapshots).toHaveLength(1);
    const started = log.find((e) => e.type === "run.started");
    expect(started).toMatchObject({ budgetUsd: 1 });
  });

  test("a change of model_settings during a run does not change the models of that run", async () => {
    const catalog = [...CATALOG, catalogEntry("anthropic/claude-sonnet-5.5")];
    const { provider } = fakes({ catalog });
    const { stub } = await paidRun();
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    await env.DB.prepare(
      "INSERT INTO model_settings (role, model_id, effort, updated_at, updated_by) VALUES (?, ?, ?, ?, ?)",
    )
      .bind("panel.claude", "anthropic/sonnet", "high", "2026-11-16T00:00:00Z", "admin")
      .run();
    catalog.push(catalogEntry("anthropic/claude-opus-5.6"));
    await runAlarms(stub);
    const claude = provider.calls.filter((c) => c.callKey.endsWith(":claude"));
    expect(claude.length).toBeGreaterThan(1);
    for (const c of claude)
      expect(c.model).toEqual({ id: "anthropic/claude-opus-5.5", effort: "medium" });
    const started = (await eventsOf(stub)).find((e) => e.type === "run.started");
    expect(started).toMatchObject({
      models: { "panel.claude": { id: "anthropic/claude-opus-5.5", effort: "medium" } },
    });
  });

  test("repeated handler errors fail the run; its owner runs it again free, with new keys", async () => {
    const { provider } = fakes();
    const { id, stub } = await paidRun();
    const restore = overrideDeps({
      provider: () => {
        throw new Error("the provider cannot be built");
      },
    });
    for (const retryCount of [0, 1])
      await expect(
        runInDurableObject(stub, (instance: RunObject) =>
          instance.alarm({ retryCount, isRetry: retryCount > 0, scheduledTime: Date.now() }),
        ),
      ).rejects.toThrow(/cannot be built/);
    expect((await stub.summary())?.status).toBe("running");
    await runInDurableObject(stub, (instance: RunObject) =>
      instance.alarm({ retryCount: 2, isRetry: true, scheduledTime: Date.now() }),
    );
    restore();
    const failed = await stub.summary();
    expect(failed).toMatchObject({ status: "failed", failure: "error", stage: "failed" });
    expect((await eventsOf(stub)).at(-1)).toMatchObject({ type: "run.failed", reason: "error" });
    let row = await env.DB.prepare("SELECT status FROM runs WHERE id = ?").bind(id).first();
    expect(row).toEqual({ status: "failed" });

    const rerun = await stub.rerun();
    expect(rerun).toMatchObject({ ok: true, summary: { status: "running", attempt: 2 } });
    expect(await stub.rerun()).toEqual({ ok: false, reason: "not_failed" });
    await runAlarms(stub);
    expect(provider.repeated()).toEqual([]);
    const log = await eventsOf(stub);
    expect(log.filter((e) => e.type === "run.started").map((e) => e.key)).toEqual([
      "run.started",
      "a2:run.started",
    ]);
    expect(log.filter((e) => e.type === "payment.confirmed")).toHaveLength(1);
    const calls = await inside(stub, (store) => store.calls());
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((c) => c.key.startsWith("a2:"))).toBe(true);
    const view = replay(log);
    expect(view.status).toBe("completed");
    expect(view.paid).toBe(true);
    expect(selectAnswer(view)).toEqual(selectAnswer((await cliRun(id)).state));
    expect((await stub.summary())?.version).toBe(4);
    row = await env.DB.prepare("SELECT status FROM runs WHERE id = ?").bind(id).first();
    expect(row).toEqual({ status: "completed" });
  });

  test("only a paid run that failed runs again, once", async () => {
    fakes({ calls: { "draft:0:grok": { kind: "error" } } });
    const unpaid = await quoted();
    expect(await unpaid.stub.rerun()).toEqual({ ok: false, reason: "not_failed" });

    // Every draft fails: the run fails with no_drafts, then its rerun fails the same way.
    const restore = overrideDeps({
      provider: () => new FakeProvider({ respond: () => ({ kind: "error" }) }),
    });
    const { stub } = await paidRun();
    await runAlarms(stub);
    expect(await stub.summary()).toMatchObject({ status: "failed", failure: "no_drafts" });
    expect(await stub.rerun()).toMatchObject({ ok: true });
    await runAlarms(stub);
    expect(await stub.summary()).toMatchObject({ status: "failed", attempt: 2 });
    expect(await stub.rerun()).toEqual({ ok: false, reason: "no_attempts_left" });
    restore();
  });
});
