import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { linkOf, quaranSeconds, shortOf } from "@chebot/protocol";
import { describe, expect, test } from "vitest";
import { handle } from "../src/worker/api.ts";
import { LINK_TRIES, type RunObject } from "../src/worker/run-object.ts";
import { RunStore } from "../src/worker/run-store.ts";
import { api, as, fakes, ORIGIN, paidRun, QUESTION, quoted } from "./helpers.ts";

/** A page of the app as the Worker answers it; the tests have no built app, so it is "app". */
const page = (path: string) =>
  handle(new Request(`${ORIGIN}${path}`), {
    ...env,
    ASSETS: { fetch: async () => new Response("app") } as unknown as Fetcher,
  });

const user = () => `user-${crypto.randomUUID()}`;
const WORDS = "capital-de-australia-poblacion-canberra";

/** The link a run gets from the fake helper, in the second it was asked plus `later`. */
async function expectedLink(stub: DurableObjectStub<RunObject>, later = 0) {
  const createdAt = (await stub.summary())?.createdAt ?? 0;
  return linkOf(shortOf(quaranSeconds(createdAt) + later), WORDS);
}

describe("the link", () => {
  test("the helper names the paid run beside the first step, once; the list and the spend show it", async () => {
    const { provider } = fakes();
    const owner = user();
    const { id, stub } = await paidRun(owner);
    expect((await stub.summary())?.link).toBeNull();
    await runDurableObjectAlarm(stub); // drafting, and the helper beside it
    const link = await expectedLink(stub);
    expect((await stub.summary())?.link).toBe(link);
    const calls = provider.calls.filter((c) => c.callKey.startsWith("link:"));
    expect(calls.map((c) => [c.callKey, c.model])).toEqual([
      ["link:1", { id: expect.stringContaining("haiku"), effort: "medium" }],
    ]);
    expect(calls[0]?.prompt).toContain(QUESTION);
    await runDurableObjectAlarm(stub);
    expect(provider.calls.filter((c) => c.callKey.startsWith("link:"))).toHaveLength(1);
    const list = (await (await api("/api/me/runs", { headers: as(owner) })).json()) as {
      runs: { id: string; link: string | null }[];
    };
    expect(list.runs).toEqual([expect.objectContaining({ id, link })]);
    const spend = (await stub.spend())?.rows.stage.find((r) => r.label === "link");
    expect(spend).toMatchObject({ calls: 1, costUsd: 0.001 });
  });

  test("a link another run has makes the run take the next second's", async () => {
    fakes();
    const { stub } = await paidRun();
    const first = await expectedLink(stub);
    await env.DB.prepare(
      // an earlier test of this file may have that link already: the run of its second
      "INSERT OR IGNORE INTO runs (id, owner, created_at, question, status, link, short) VALUES (?, 'otro', ?, 'otra', 'running', ?, ?)",
    )
      .bind(crypto.randomUUID(), new Date().toISOString(), first, first.split("-")[0])
      .run();
    await runDurableObjectAlarm(stub);
    expect((await stub.summary())?.link).toBe(await expectedLink(stub, 1));
  });

  test("a helper that fails is tried on the next ticks, at most LINK_TRIES, and the run goes on", async () => {
    const { provider } = fakes({
      calls: Object.fromEntries(
        Array.from({ length: LINK_TRIES + 1 }, (_, i) => [`link:${i + 1}`, { kind: "error" }]),
      ),
    });
    const { stub } = await paidRun();
    for (let n = 0; n < LINK_TRIES + 2; n++) await runDurableObjectAlarm(stub);
    expect(provider.calls.filter((c) => c.callKey.startsWith("link:"))).toHaveLength(LINK_TRIES);
    expect(await stub.summary()).toMatchObject({ link: null, status: "running" });
    // The spend counts every try, not one call of their summed cost.
    const spend = (await stub.spend())?.rows.stage.find((r) => r.label === "link");
    expect(spend?.calls).toBe(LINK_TRIES);
  });

  test("the UUID page and the short link redirect for good to the link; the link resolves to the UUID", async () => {
    fakes();
    const { id, stub } = await paidRun();
    // Before the link, the page of the UUID is the app.
    expect((await page(`/r/${id}`)).status).toBe(200);
    await runDurableObjectAlarm(stub);
    const link = (await stub.summary())?.link ?? "";
    const short = link.split("-")[0] ?? "";
    for (const from of [id, id.toUpperCase(), short, `${short}-otras-palabras`]) {
      const response = await page(`/r/${from}?x=1`);
      expect(response.status, from).toBe(301);
      expect(response.headers.get("location"), from).toBe(`/r/${link}?x=1`);
    }
    expect((await page(`/r/${link}`)).status).toBe(200);
    for (const ref of [link, short])
      expect(await (await api(`/api/links/${ref}`)).json(), ref).toEqual({ id, link });
    expect((await api("/api/links/zzzzzzz-nada")).status).toBe(404);
    expect((await api("/api/links/no.es")).status).toBe(404);
  });
});

test("an object created before the link columns gets them when it is read again", async () => {
  fakes();
  const { stub } = await quoted("ana");
  await runInDurableObject(stub, (_: RunObject, state) => {
    for (const column of ["link", "helper", "link_tries"])
      state.storage.sql.exec(`ALTER TABLE run DROP COLUMN ${column}`);
  });
  await runInDurableObject(stub, (_: RunObject, state) => {
    const store = new RunStore(state.storage.sql);
    expect(store.run()).toMatchObject({ owner: "ana", link: null, linkCalls: [], linkTries: 0 });
    store.updateRun({ link: "abc-una-prueba" });
    expect(store.run()?.link).toBe("abc-una-prueba");
    // An object of before kept the helper's tries as one summed call.
    const summed = { model: "haiku", costUsd: 0.003, inputTokens: 30, outputTokens: 3 };
    store.updateRun({ helper: JSON.stringify(summed) });
    expect(store.run()?.linkCalls).toEqual([summed]);
  });
});
