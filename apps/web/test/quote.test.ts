import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, test } from "vitest";
import { handle } from "../src/worker/api.ts";
import { MAX_QUESTION_CHARS } from "../src/worker/quote.ts";
import { type RunObject, runStub } from "../src/worker/run-object.ts";
import { RunStore } from "../src/worker/run-store.ts";
import { dailyCapUsd, spendMeter } from "../src/worker/spend-meter.ts";
import {
  api,
  as,
  ask,
  contrib,
  eventsOf,
  fakes,
  ORIGIN,
  paidRun,
  paying,
  QUESTION,
  runAlarms,
} from "./helpers.ts";

const user = () => `user-${crypto.randomUUID()}`;

interface QuoteBody {
  runId: string;
  class: string;
  amount: number;
  currency: string;
}

describe("the quote", () => {
  test("the class sets the price; a choice under 0.7 or a failed classification is complex; no panel call", async () => {
    const { provider, classifier } = fakes();
    const cases = [
      { choice: "simple", probability: 0.92, fail: false, class: "simple", amount: 5000 },
      { choice: "simple", probability: 0.7, fail: false, class: "simple", amount: 5000 },
      { choice: "simple", probability: 0.69, fail: false, class: "complex", amount: 10000 },
      { choice: "simple", probability: null, fail: false, class: "complex", amount: 10000 },
      { choice: "complex", probability: 0.95, fail: false, class: "complex", amount: 10000 },
      { choice: "simple", probability: 0.99, fail: true, class: "complex", amount: 10000 },
    ] as const;
    for (const c of cases) {
      classifier.choice = c.choice;
      classifier.probability = c.probability;
      classifier.fail = c.fail;
      const owner = user();
      const response = await ask(contrib(owner), `  ${QUESTION}  `);
      expect(response.status, JSON.stringify(c)).toBe(201);
      const body = (await response.json()) as QuoteBody;
      expect(body).toEqual({
        runId: expect.stringMatching(/^[0-9a-f-]{36}$/),
        class: c.class,
        amount: c.amount,
        currency: "ARS",
      });
      const stub = runStub(env, body.runId);
      expect(await stub.summary()).toMatchObject({
        question: QUESTION,
        status: "quoted",
        class: c.class,
        amount: c.amount,
      });
      expect(await stub.owner()).toBe(owner);
      expect((await eventsOf(stub)).map((e) => e.type)).toEqual(["run.quoted"]);
      expect(await runDurableObjectAlarm(stub)).toBe(false);
      const row = await env.DB.prepare("SELECT owner, status, class FROM runs WHERE id = ?")
        .bind(body.runId)
        .first();
      expect(row).toEqual({ owner, status: "quoted", class: c.class });
    }
    expect(classifier.questions).toHaveLength(cases.length);
    expect(classifier.questions.every((q) => q === QUESTION)).toBe(true);
    expect(provider.calls).toEqual([]);
  });

  test("only GET and POST; the body is a question", async () => {
    fakes();
    expect((await api("/api/runs", { method: "PUT", headers: contrib(user()) })).status).toBe(405);
    const bad = await api("/api/runs", { method: "POST", headers: contrib(user()), body: "{" });
    expect(bad.status).toBe(400);
    expect((await ask(contrib(user()), 42)).status).toBe(400);
    expect((await ask(contrib(user()), "   ")).status).toBe(400);
  });
});

describe("the guardrails", () => {
  test("a question of more than 2,000 characters is refused", async () => {
    const { classifier } = fakes();
    expect((await ask(contrib(user()), "a".repeat(MAX_QUESTION_CHARS + 1))).status).toBe(400);
    expect(classifier.questions).toEqual([]);
    expect((await ask(contrib(user()), "a".repeat(MAX_QUESTION_CHARS))).status).toBe(201);
  });

  test("until launch only the exact Admin and Contrib roles ask; LAUNCHED opens it to every signed-in user", async () => {
    const { classifier } = fakes();
    expect((await ask({})).status).toBe(401);
    expect((await ask(as(user()))).status).toBe(403);
    for (const role of ["contrib", "admin", "CONTRIB", "Contributor", "Admins", "beta"])
      expect((await ask(as(user(), [role]))).status, role).toBe(403);
    expect(classifier.questions).toEqual([]);
    expect((await ask(as(user(), ["Contrib"]))).status).toBe(201);
    expect((await ask(as(user(), ["Admin"]))).status).toBe(201);
    const launched = await handle(
      new Request(`${ORIGIN}/api/runs`, {
        method: "POST",
        headers: { ...as(user()), origin: ORIGIN },
        body: JSON.stringify({ question: QUESTION }),
      }),
      { ...env, LAUNCHED: "true" },
    );
    expect(launched.status).toBe(201);
  });

  test("the rate limit brakes one user, not the others", async () => {
    fakes();
    const busy = user();
    const statuses: number[] = [];
    for (let n = 0; n < 6; n++) statuses.push((await ask(contrib(busy))).status);
    expect(statuses).toEqual([201, 201, 201, 201, 201, 429]);
    expect((await ask(contrib(user()))).status).toBe(201);
  });

  test("the daily cap refuses a new question, never a paid one; reserve and settle add up", async () => {
    // A cap of 20 USD (vitest.config.ts) and runs of a budget of 8: two runs fit, a third does not.
    const { classifier, jobs } = fakes({ config: { budgetUsd: 8 } });
    expect(dailyCapUsd(env)).toBe(20);
    const meter = spendMeter(env);

    // Asked and shown its QR while there was room.
    const waiting = await paying(user());
    expect(await runDurableObjectAlarm(waiting.stub)).toBe(true);
    const first = await paidRun(user());
    const second = await paidRun(user());
    expect(await meter.status()).toMatchObject({ reservedUsd: 16, spentUsd: 0 });

    const refused = await ask(contrib(user()));
    expect(refused.status).toBe(503);
    expect(await refused.json()).toMatchObject({ reason: "daily_cap" });
    expect(classifier.questions).toEqual([]);
    // The user who already has the QR pays: the run starts over the cap.
    expect((await jobs.pay(waiting.id)).status).toBe(200);
    expect((await waiting.stub.summary())?.status).toBe("running");
    expect(await meter.status()).toMatchObject({ reservedUsd: 24, open: false });

    // Each run settles its real spend: what remains reserved is the runs still going.
    await runAlarms(first.stub);
    const spentFirst = await spentOf(first.stub);
    expect(spentFirst).toBeGreaterThan(0);
    let status = await meter.status();
    expect(status.reservedUsd).toBe(16);
    expect(status.spentUsd).toBeCloseTo(spentFirst, 9);
    await runAlarms(second.stub);
    await runAlarms(waiting.stub);
    status = await meter.status();
    expect(status.reservedUsd).toBe(0);
    expect(status.spentUsd).toBeCloseTo(
      spentFirst + (await spentOf(second.stub)) + (await spentOf(waiting.stub)),
      9,
    );

    // With room again, a new question is quoted; its classification is counted.
    expect((await ask(contrib(user()))).status).toBe(201);
    expect((await meter.status()).spentUsd).toBeCloseTo(status.spentUsd + 0.001, 9);
  });

  test("a quoted run is refused at its payment when the cap is reached, before any job", async () => {
    const { jobs } = fakes({ config: { budgetUsd: 8 } });
    const owner = user();
    const created = await ask(contrib(owner));
    const { runId } = (await created.json()) as QuoteBody;
    await paidRun(user());
    await paidRun(user());
    const pay = await api(`/api/runs/${runId}/pay`, { method: "POST", headers: as(owner) });
    expect(pay.status).toBe(503);
    expect((await runStub(env, runId).summary())?.status).toBe("quoted");
    expect(jobs.count("enqueue", runId)).toBe(0);
  });
});

/** What a run spent, as its state counts it, and the helper's link and the picture beside it. */
const spentOf = (stub: DurableObjectStub<RunObject>) =>
  runInDurableObject(stub, (_: RunObject, state) => {
    const run = new RunStore(state.storage.sql).run();
    const picture = run?.imageCalls.reduce((sum, call) => sum + call.costUsd, 0) ?? 0;
    return (run?.state?.spentUsd ?? 0) + (run?.helper?.costUsd ?? 0) + picture;
  });
