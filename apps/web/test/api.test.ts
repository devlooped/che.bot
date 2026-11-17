import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import type { LoggedEvent } from "@chebot/protocol";
import { describe, expect, test, vi } from "vitest";
import { type RunObject, runStub } from "../src/worker/run-object.ts";
import { RunStore } from "../src/worker/run-store.ts";
import type { RunSpend } from "../src/worker/spend.ts";
import { api, as, ask, contrib, eventsOf, fakes, paidRun, quoted, runAlarms } from "./helpers.ts";

const user = () => `user-${crypto.randomUUID()}`;

describe("reading a run", () => {
  test("a run is readable by its id without signing in", async () => {
    fakes();
    const { id, stub } = await paidRun();
    await runAlarms(stub);
    const read = await api(`/api/runs/${id}`);
    expect(read.status).toBe(200);
    const summary = (await read.json()) as Record<string, unknown>;
    expect(summary).toMatchObject({ id, status: "completed", stage: "done", version: 4 });
    expect(summary).not.toHaveProperty("owner");
    expect(summary.mine).toBe(false);
    const asOwner = (await (await api(`/api/runs/${id}`, { headers: as("user-1") })).json()) as {
      mine: boolean;
    };
    expect(asOwner.mine).toBe(true);
    const asOther = (await (await api(`/api/runs/${id}`, { headers: as(user()) })).json()) as {
      mine: boolean;
    };
    expect(asOther.mine).toBe(false);

    const all = (await (await api(`/api/runs/${id}/events`)).json()) as { events: LoggedEvent[] };
    expect(all.events.map((e) => e.seq)).toEqual(all.events.map((_, i) => i + 1));
    expect(all.events.at(-1)?.seq).toBe(summary.lastSeq);
    const later = (await (await api(`/api/runs/${id}/events?after=40`)).json()) as {
      events: LoggedEvent[];
    };
    expect(later.events).toEqual(all.events.filter((e) => e.seq > 40));
    expect((await api(`/api/runs/${id}/events?after=x`)).status).toBe(400);

    const v1 = await api(`/api/runs/${id}/snapshots/1`);
    expect(v1.status).toBe(200);
    expect(await v1.json()).toEqual(all.events.find((e) => e.type === "document.seeded")?.snapshot);
    expect((await api(`/api/runs/${id}/snapshots/99`)).status).toBe(404);
  });

  test("an unknown run answers 404 and stores nothing", async () => {
    fakes();
    const id = crypto.randomUUID();
    expect((await api(`/api/runs/${id}`)).status).toBe(404);
    expect((await api(`/api/runs/${id}/events`)).status).toBe(404);
    expect((await api(`/api/runs/${id}/snapshots/1`)).status).toBe(404);
    expect((await api("/api/runs/not-a-uuid")).status).toBe(404);
    expect((await api("/api/nothing")).status).toBe(404);
  });
});

describe("the runs of a user", () => {
  test("/api/me/runs lists the caller's runs, newest first, and needs a user", async () => {
    fakes();
    const me = user();
    const first = await quoted(me);
    const second = await paidRun(me);
    await quoted(user());
    expect((await api("/api/me/runs")).status).toBe(401);
    const response = await api("/api/me/runs", { headers: as(me) });
    expect(response.status).toBe(200);
    const { runs } = (await response.json()) as { runs: { id: string; status: string }[] };
    expect(runs.map((r) => r.id)).toEqual([second.id, first.id]);
    expect(runs.map((r) => r.status)).toEqual(["running", "quoted"]);
    expect(runs[0]).toMatchObject({ class: "complex", amount: 10000 });
  });
});

describe("deleting a run", () => {
  test("only its owner or an admin deletes it; a deleted run answers 404 and stores nothing", async () => {
    fakes();
    const owner = user();
    const { id, stub } = await paidRun(owner);
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect((await api(`/api/runs/${id}`, { method: "DELETE" })).status).toBe(401);
    expect((await api(`/api/runs/${id}`, { method: "DELETE", headers: as(user()) })).status).toBe(
      403,
    );
    expect((await api(`/api/runs/${id}`, { method: "DELETE", headers: as(owner) })).status).toBe(
      204,
    );
    expect((await api(`/api/runs/${id}`)).status).toBe(404);
    expect((await api(`/api/runs/${id}/events`)).status).toBe(404);
    expect((await api(`/api/runs/${id}/snapshots/1`)).status).toBe(404);
    expect((await api(`/api/runs/${id}`, { method: "DELETE", headers: as(owner) })).status).toBe(
      404,
    );
    const { runs } = (await (await api("/api/me/runs", { headers: as(owner) })).json()) as {
      runs: unknown[];
    };
    expect(runs).toEqual([]);
    expect(await runDurableObjectAlarm(stub)).toBe(false);
    const tables = await runInDurableObject(stub, (_: RunObject, state) =>
      state.storage.sql.exec("SELECT name FROM sqlite_master WHERE type = 'table'").toArray(),
    );
    expect(tables.filter((t) => !String(t.name).startsWith("_cf_"))).toEqual([]);
  });

  test("an admin deletes another user's run", async () => {
    fakes();
    const { id } = await quoted(user());
    const deleted = await api(`/api/runs/${id}`, {
      method: "DELETE",
      headers: as(user(), ["Admin"]),
    });
    expect(deleted.status).toBe(204);
    expect((await api(`/api/runs/${id}`)).status).toBe(404);
  });
});

describe("running a failed run again", () => {
  test("only the owner may, and only a failed paid run", async () => {
    fakes();
    const owner = user();
    const { id } = await paidRun(owner);
    expect((await api(`/api/runs/${id}/rerun`, { method: "POST" })).status).toBe(401);
    expect(
      (await api(`/api/runs/${id}/rerun`, { method: "POST", headers: as(user(), ["Admin"]) }))
        .status,
    ).toBe(403);
    const running = await api(`/api/runs/${id}/rerun`, { method: "POST", headers: as(owner) });
    expect(running.status).toBe(409);
    expect(await running.json()).toMatchObject({ reason: "not_failed" });
  });
});

describe("the spend of a run", () => {
  const spendOf = async (id: string, headers: Record<string, string>) =>
    (await (await api(`/api/runs/${id}/spend`, { headers })).json()) as RunSpend;

  test("only an admin reads it; it counts the classification, each call as it lands, and the calls in flight", async () => {
    fakes();
    const admin = as(user(), ["Admin"]);
    const { runId: id } = (await (await ask(admin)).json()) as { runId: string };
    expect((await api(`/api/runs/${id}/pay`, { method: "POST", headers: admin })).status).toBe(202);
    const stub = runStub(env, id);

    expect((await api(`/api/runs/${id}/spend`)).status).toBe(401);
    expect((await api(`/api/runs/${id}/spend`, { headers: contrib(user()) })).status).toBe(403);
    expect((await api(`/api/runs/${crypto.randomUUID()}/spend`, { headers: admin })).status).toBe(
      404,
    );

    // Before the first tick: only the classification (FakeClassifier: US$0.001).
    const classified = await spendOf(id, admin);
    expect(classified).toMatchObject({ totalUsd: 0.001, calls: 1, running: 0 });
    expect(classified.rows.agent).toEqual([
      expect.objectContaining({ label: "classifier", calls: 1, inputTokens: 10, outputTokens: 1 }),
    ]);
    expect(classified.rows.stage.map((r) => r.label)).toEqual(["classify"]);

    // A draft that started and has not landed is in flight, under its agent, model and stage.
    await runInDurableObject(stub, async (_: RunObject, state) => {
      await new RunStore(state.storage.sql).ledger("").begin?.("draft:0:grok", Date.now());
    });
    const inFlight = await spendOf(id, admin);
    expect(inFlight).toMatchObject({ totalUsd: 0.001, calls: 1, running: 1 });
    expect(inFlight.rows.agent.find((r) => r.label === "grok")).toMatchObject({
      calls: 0,
      running: 1,
      costUsd: 0,
    });
    expect(inFlight.rows.stage.find((r) => r.label === "draft")).toMatchObject({ running: 1 });

    // The drafts land: four calls of the panel, each with its cost, and the helper's link.
    await runDurableObjectAlarm(stub);
    const drafted = await spendOf(id, admin);
    expect(drafted.running).toBe(0);
    expect(drafted.rows.stage.find((r) => r.label === "draft")).toMatchObject({ calls: 4 });
    expect(drafted.rows.stage.find((r) => r.label === "link")).toMatchObject({ calls: 1 });
    expect(drafted.rows.agent.map((r) => r.label).sort()).toEqual(
      ["claude", "classifier", "gemini", "grok", "helper", "openai"].sort(),
    );

    // At the end, the total is what the run spent plus the classification, in every pivot.
    await runAlarms(stub);
    const done = await spendOf(id, admin);
    const ended = (await eventsOf(stub)).find((e) => e.type === "run.completed");
    if (ended?.type !== "run.completed") throw new Error("the run did not complete");
    // the classification and the helper's link, US$0.001 each, are beside the run's own spend
    expect(done.totalUsd).toBeCloseTo(ended.spentUsd + 0.002, 9);
    for (const rows of Object.values(done.rows))
      expect(rows.reduce((sum, r) => sum + r.costUsd, 0)).toBeCloseTo(done.totalUsd, 9);
    expect(done.rows.agent.map((r) => r.label)).toContain("utility");
    expect(done.rows.agent.map((r) => r.label)).not.toContain("renderer");
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

describe("the event stream", () => {
  test("a client that disconnects and reconnects with after=<seq> receives every event once, in order", async () => {
    fakes();
    const { id, stub } = await paidRun();
    const first = await connect(id, 0);
    await vi.waitFor(() => expect(first.received).toHaveLength(4));
    expect(first.received.map((e) => e.type)).toEqual([
      "run.quoted",
      "payment.requested",
      "payment.confirmed",
      "run.started",
    ]);
    // Drafts and merge, live.
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    let sent = (await stub.summary())?.lastSeq ?? 0;
    await vi.waitFor(() => expect(first.received.at(-1)?.seq).toBe(sent));
    first.ws.close(1000, "tab closed");
    const seen = first.received.at(-1)?.seq ?? 0;

    // Missed while away.
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    const second = await connect(id, seen);
    sent = (await stub.summary())?.lastSeq ?? 0;
    expect(sent).toBeGreaterThan(seen);
    await vi.waitFor(() => expect(second.received.at(-1)?.seq).toBe(sent));
    await runAlarms(stub);
    sent = (await stub.summary())?.lastSeq ?? 0;
    await vi.waitFor(() => expect(second.received.at(-1)?.seq).toBe(sent));

    const all = [...first.received, ...second.received];
    expect(all.map((e) => e.seq)).toEqual(Array.from({ length: sent }, (_, i) => i + 1));
    expect(all).toEqual(await eventsOf(stub));
    second.ws.close(1000, "done");
  });

  test("the stream of an unknown run answers 404; a plain request answers 426", async () => {
    fakes();
    const unknown = await api(`/api/runs/${crypto.randomUUID()}/ws`, {
      headers: { Upgrade: "websocket" },
    });
    expect(unknown.status).toBe(404);
    const { id } = await quoted();
    expect((await api(`/api/runs/${id}/ws`)).status).toBe(426);
    expect(
      (await api(`/api/runs/${id}/ws?after=-1`, { headers: { Upgrade: "websocket" } })).status,
    ).toBe(400);
  });
});
