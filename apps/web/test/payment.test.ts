import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import type { LoggedEvent } from "@chebot/protocol";
import { FakeProvider } from "@chebot/providers";
import { describe, expect, test, vi } from "vitest";
import { overrideDeps } from "../src/worker/deps.ts";
import { JobsError } from "../src/worker/jobs.ts";
import { PAYMENT_WINDOW_MS, type RunObject } from "../src/worker/run-object.ts";
import { RunStore } from "../src/worker/run-store.ts";
import {
  api,
  as,
  eventsOf,
  fakes,
  HOOK_URL,
  paidRun,
  paying,
  quoted,
  runAlarms,
} from "./helpers.ts";

type Stub = DurableObjectStub<RunObject>;

const user = () => `user-${crypto.randomUUID()}`;
const types = (log: readonly LoggedEvent[]) => log.map((e) => e.type);
const run = (stub: Stub) =>
  runInDurableObject(stub, (_: RunObject, state) => new RunStore(state.storage.sql).run());
const listed = async (id: string) =>
  (await env.DB.prepare("SELECT status FROM runs WHERE id = ?").bind(id).first())?.status;

/** Moves the payment window of a run back by `ms`, as if that much time had passed. */
const age = (stub: Stub, ms: number) =>
  runInDurableObject(stub, (_: RunObject, state) => {
    const store = new RunStore(state.storage.sql);
    store.updateRun({ pay_requested_at: (store.run()?.payRequestedAt ?? 0) - ms });
  });

describe("paying", () => {
  test("only the owner pays; the job is enqueued once and its QR shown once; no panel call before the hook", async () => {
    const { provider, jobs } = fakes();
    const owner = user();
    const { id, stub } = await quoted(owner);
    const pay = (headers: Record<string, string>) =>
      api(`/api/runs/${id}/pay`, { method: "POST", headers });
    expect((await pay({})).status).toBe(401);
    expect((await pay(as(user(), ["Contrib"]))).status).toBe(403);
    expect(
      (await api(`/api/runs/${crypto.randomUUID()}/pay`, { method: "POST", headers: as(owner) }))
        .status,
    ).toBe(404);

    const first = await pay(as(owner, ["Contrib"]));
    expect(first.status).toBe(202);
    expect(await first.json()).toMatchObject({ id, status: "awaiting_payment" });
    expect(jobs.calls).toEqual([]); // 202 at once: the alarm talks to the jobs service

    jobs.qrAfter = 1; // the first read finds the job still "created"
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect(jobs.count("enqueue")).toBe(1);
    expect(types(await eventsOf(stub))).toEqual(["run.quoted"]);
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect((await pay(as(owner))).status).toBe(202);
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect(await runDurableObjectAlarm(stub)).toBe(true);

    expect(jobs.count("enqueue")).toBe(1);
    const job = jobs.jobs.get(id)?.job;
    expect(job).toMatchObject({
      id,
      actor: owner,
      name: "che.bot: pregunta compleja",
      amount: 10000,
      currency: "ARS",
      hook: { url: HOOK_URL },
    });
    expect(job?.hook.token).toMatch(/^[\w-]{43}$/);
    const log = await eventsOf(stub);
    expect(types(log)).toEqual(["run.quoted", "payment.requested"]);
    expect(log[1]).toMatchObject({
      amount: 10000,
      currency: "ARS",
      qr: jobs.jobs.get(id)?.qr,
    });
    expect(provider.calls).toEqual([]);
    expect(await listed(id)).toBe("awaiting_payment");
    // Waiting for the payment, the one alarm is set at the end of the window.
    const alarm = await runInDurableObject(stub, (_: RunObject, state) => state.storage.getAlarm());
    expect(alarm).toBe(((await run(stub))?.payRequestedAt ?? 0) + PAYMENT_WINDOW_MS);
  });

  test("the hook starts the run once; a wrong token, a repeated hook or a second pay changes nothing", async () => {
    const { provider, jobs } = fakes();
    const owner = user();
    const { id, stub } = await paying(owner);
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    const hook = (
      headers: Record<string, string>,
      body: unknown = { id, actor: owner, input: [] },
    ) => api("/api/pay/hook", { method: "POST", headers, body: JSON.stringify(body) });

    expect((await hook({})).status).toBe(401);
    expect((await hook({ authorization: "Bearer wrong" })).status).toBe(403);
    expect((await hook({ authorization: "Bearer wrong" }, { id: "nope" })).status).toBe(400);
    const token = jobs.jobs.get(id)?.job.hook.token ?? "";
    expect(
      (await hook({ authorization: `Bearer ${token}` }, { id: crypto.randomUUID() })).status,
    ).toBe(404);
    expect(
      (await api("/api/pay/hook", { headers: { authorization: `Bearer ${token}` } })).status,
    ).toBe(405);
    expect(types(await eventsOf(stub))).toEqual(["run.quoted", "payment.requested"]);
    expect(provider.calls).toEqual([]);

    expect((await jobs.pay(id)).status).toBe(200);
    const started = await eventsOf(stub);
    expect(types(started)).toEqual([
      "run.quoted",
      "payment.requested",
      "payment.confirmed",
      "run.started",
    ]);
    expect(provider.calls).toEqual([]); // the first tick makes the first calls

    expect((await hook({ authorization: `Bearer ${token}` })).status).toBe(200);
    expect((await api(`/api/runs/${id}/pay`, { method: "POST", headers: as(owner) })).status).toBe(
      202,
    );
    expect(await eventsOf(stub)).toEqual(started);
    expect(jobs.count("enqueue")).toBe(1);

    await runAlarms(stub);
    expect(provider.repeated()).toEqual([]);
    expect((await stub.summary())?.status).toBe("completed");
  });

  test("a client that reconnects with after=<seq> receives every event once, in order, including the QR", async () => {
    const { jobs } = fakes();
    const owner = user();
    const { id, stub } = await quoted(owner);
    const first = await connect(id, 0);
    await vi.waitFor(() => expect(first.received).toHaveLength(1));
    first.ws.close(1000, "tab closed");

    // Missed while away: the QR.
    await api(`/api/runs/${id}/pay`, { method: "POST", headers: as(owner) });
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    const second = await connect(id, first.received.at(-1)?.seq ?? 0);
    await vi.waitFor(() => expect(second.received).toHaveLength(1));
    expect(second.received[0]).toMatchObject({
      type: "payment.requested",
      qr: jobs.jobs.get(id)?.qr,
    });
    second.ws.close(1000, "reload");

    // A reload from the start shows the same QR; then the run, live.
    const third = await connect(id, 0);
    await vi.waitFor(() => expect(third.received).toHaveLength(2));
    await jobs.pay(id);
    await runAlarms(stub);
    const sent = (await stub.summary())?.lastSeq ?? 0;
    await vi.waitFor(() => expect(third.received.at(-1)?.seq).toBe(sent));
    expect(third.received).toEqual(await eventsOf(stub));
    expect(third.received.filter((e) => e.type === "payment.requested")).toHaveLength(1);
    expect([...first.received, ...second.received]).toEqual(third.received.slice(0, 2));
    third.ws.close(1000, "done");
  });

  test("an unpaid run expires after 15 minutes and its job is cancelled", async () => {
    const { provider, jobs } = fakes();
    const owner = user();
    const { id, stub } = await paying(owner);
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    await age(stub, PAYMENT_WINDOW_MS - 60_000);
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect((await stub.summary())?.status).toBe("awaiting_payment");
    expect(jobs.count("cancel")).toBe(0);

    await age(stub, 60_000);
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect(jobs.count("cancel", id)).toBe(1);
    expect(jobs.jobs.has(id)).toBe(false);
    expect(await stub.summary()).toMatchObject({ status: "expired", stage: "expired" });
    expect(types(await eventsOf(stub))).toEqual(["run.quoted", "payment.requested", "run.expired"]);
    expect(await listed(id)).toBe("expired");
    expect(await runDurableObjectAlarm(stub)).toBe(false);

    // Nothing starts it any more: not the owner, not a late hook.
    expect((await api(`/api/runs/${id}/pay`, { method: "POST", headers: as(owner) })).status).toBe(
      202,
    );
    const token = (await run(stub))?.hookToken ?? "";
    const late = await api("/api/pay/hook", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify({ id }),
    });
    expect(late.status).toBe(409);
    expect((await stub.summary())?.status).toBe("expired");
    expect(provider.calls).toEqual([]);
  });

  test("a job that was paid but whose hook was lost starts the run at the end of the window", async () => {
    const { jobs } = fakes();
    const { id, stub } = await paying();
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    const entry = jobs.jobs.get(id);
    if (entry) entry.status = "queued";
    await age(stub, PAYMENT_WINDOW_MS);
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect((await stub.summary())?.status).toBe("running");
    expect(types(await eventsOf(stub)).slice(-2)).toEqual(["payment.confirmed", "run.started"]);
  });

  test("a job the service refuses for good expires the run at once; a failing service is tried again", async () => {
    const { jobs } = fakes();
    const { stub } = await paying();
    jobs.failures.set("enqueue", new Error("network"));
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect((await run(stub))?.retries).toBe(1);
    expect((await stub.summary())?.status).toBe("awaiting_payment");
    jobs.failures.set("enqueue", new JobsError(400, "Automation URL must be https."));
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect((await stub.summary())?.status).toBe("expired");
    expect(jobs.count("cancel")).toBe(0);
  });

  test("a payment is recorded before anything that can fail; a run that cannot start yet starts on a later alarm", async () => {
    const { jobs, provider, catalog } = fakes();
    const { id, stub } = await paying();
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    const restore = overrideDeps({
      catalog: async () => {
        throw new Error("the catalog is down");
      },
    });
    expect((await jobs.pay(id)).status).toBe(200);
    expect((await stub.summary())?.status).toBe("awaiting_payment");
    expect(types(await eventsOf(stub)).at(-1)).toBe("payment.confirmed");
    restore();
    overrideDeps({ catalog: async () => catalog });
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect((await stub.summary())?.status).toBe("running");
    expect(provider.calls).toEqual([]);
  });
});

describe("the end of a paid run", () => {
  test("a paid run ends with its job done", async () => {
    const { jobs } = fakes();
    const { id, stub } = await paidRun();
    await runAlarms(stub);
    expect((await stub.summary())?.status).toBe("completed");
    expect(jobs.jobs.get(id)).toMatchObject({
      status: "done",
      message: "La respuesta está lista.",
    });
    expect(jobs.count("finish", id)).toBe(1);
    expect((await run(stub))?.jobClosed).toBe("done");
  });

  test("a run that fails after payment ends with its job failed and runs again free", async () => {
    const { jobs } = fakes();
    const restore = overrideDeps({
      provider: () => new FakeProvider({ respond: () => ({ kind: "error" }) }),
    });
    const owner = user();
    const { id, stub } = await paidRun(owner);
    await runAlarms(stub);
    restore();
    expect(await stub.summary()).toMatchObject({ status: "failed", failure: "no_drafts" });
    expect(jobs.jobs.get(id)?.status).toBe("failed");

    const rerun = await api(`/api/runs/${id}/rerun`, { method: "POST", headers: as(owner) });
    expect(rerun.status).toBe(202);
    await runAlarms(stub);
    expect((await stub.summary())?.status).toBe("completed");
    expect(jobs.count("enqueue")).toBe(1);
    expect(jobs.count("finish", id)).toBe(1);
    expect(jobs.jobs.get(id)?.status).toBe("failed");
  });

  test("a job that cannot be ended yet is tried again on the alarm", async () => {
    const { jobs } = fakes();
    const { id, stub } = await paidRun();
    jobs.failures.set("finish", new Error("network"));
    await runAlarms(stub);
    expect(jobs.count("finish", id)).toBe(2);
    expect(jobs.jobs.get(id)?.status).toBe("done");
  });
});

describe("an admin run", () => {
  test("starts without a job and without a payment", async () => {
    const { jobs, provider } = fakes();
    const admin = user();
    const { id, stub } = await quoted(admin);
    const paid = await api(`/api/runs/${id}/pay`, {
      method: "POST",
      headers: as(admin, ["Admin"]),
    });
    expect(paid.status).toBe(202);
    expect(await paid.json()).toMatchObject({ status: "running" });
    expect(types(await eventsOf(stub))).toEqual(["run.quoted", "run.started"]);
    await runAlarms(stub);
    expect((await stub.summary())?.status).toBe("completed");
    expect(jobs.calls).toEqual([]);
    expect(provider.calls.length).toBeGreaterThan(0);
    expect(await run(stub)).toMatchObject({ free: true, paidAt: null, hookToken: null });
  });
});

/** A browser's connection to the event stream of a run. */
async function connect(id: string, after: number) {
  const response = await api(`/api/runs/${id}/ws?after=${after}`, {
    headers: { Upgrade: "websocket" },
  });
  expect(response.status).toBe(101);
  const ws = response.webSocket;
  if (!ws) throw new Error("no WebSocket");
  const received: LoggedEvent[] = [];
  ws.addEventListener("message", (message: MessageEvent) => {
    received.push(JSON.parse(String(message.data)) as LoggedEvent);
  });
  ws.accept();
  return { ws, received };
}
