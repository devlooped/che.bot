import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { CATALOG, catalogEntry } from "@chebot/driver/testing";
import { FakeImageProvider, ONE_PIXEL_PNG } from "@chebot/providers";
import { describe, expect, test } from "vitest";
import { IMAGE_TRIES, type RunObject } from "../src/worker/run-object.ts";
import { RunStore } from "../src/worker/run-store.ts";
import { api, as, fakes, paidRun, QUESTION, quoted } from "./helpers.ts";

const user = () => `user-${crypto.randomUUID()}`;

interface PublicList {
  runs: { id: string; question: string; status: string; image: string | null; mine: boolean }[];
  next: string | null;
}

const list = async (query = "") => (await (await api(`/api/runs${query}`)).json()) as PublicList;

describe("the picture of a question", () => {
  test("the helper writes its prompt and the image model draws it beside the first step, once", async () => {
    const { provider, images } = fakes();
    const { id, stub } = await paidRun(user());
    expect((await stub.summary())?.image).toBeNull();
    await runDurableObjectAlarm(stub); // drafting, with the link and the picture beside it
    const version = (await stub.summary())?.image;
    expect(version).toEqual(expect.any(String));

    const prompts = provider.calls.filter((c) => c.callKey.startsWith("illustration:"));
    expect(prompts.map((c) => [c.callKey, c.model.id])).toEqual([
      ["illustration:1", expect.stringContaining("haiku")],
    ]);
    expect(prompts[0]?.prompt).toContain(QUESTION);
    expect(images.calls).toEqual([
      expect.objectContaining({
        callKey: "image:1",
        model: { id: "spacexai/grok-imagine-image-2.0", effort: null },
        prompt: expect.stringContaining("Canberra"),
        aspectRatio: "1:1",
      }),
    ]);

    await runDurableObjectAlarm(stub);
    expect(images.calls).toHaveLength(1);

    const response = await api(`/api/runs/${id}/image?v=${version}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toContain("immutable");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(ONE_PIXEL_PNG);
    expect((await api(`/api/runs/${id}/image`)).headers.get("cache-control")).toBe(
      "public, max-age=300",
    );

    const spend = await stub.spend();
    expect(spend?.rows.agent.find((r) => r.label === "image")).toMatchObject({
      calls: 1,
      costUsd: 0.04,
    });
    expect(spend?.rows.stage.map((r) => r.label)).toEqual(
      expect.arrayContaining(["illustration", "image"]),
    );
  });

  test("a picture larger than a value of the storage is kept in chunks", async () => {
    const big = new Uint8Array(2_500_000).map((_, i) => i % 251);
    fakes({
      images: new FakeImageProvider(() => ({ bytes: big, mediaType: "image/jpeg", costUsd: 0 })),
    });
    const { id, stub } = await paidRun(user());
    await runDurableObjectAlarm(stub);
    const response = await api(`/api/runs/${id}/image`);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(big);
  });

  test("a model that fails is tried on the next tick, at most IMAGE_TRIES, and the run goes on", async () => {
    const images = new FakeImageProvider(() => {
      throw new Error("the image model is down");
    });
    const { provider } = fakes({
      images,
      calls: { "illustration:1": { kind: "error" } },
    });
    const { id, stub } = await paidRun(user());
    for (let n = 0; n < IMAGE_TRIES + 2; n++) await runDurableObjectAlarm(stub);
    expect(images.calls).toHaveLength(IMAGE_TRIES);
    // Without the helper's prompt, the question itself is drawn.
    expect(images.calls[0]?.prompt).toContain(QUESTION);
    expect(images.calls[1]?.prompt).toContain("Canberra");
    expect(provider.calls.filter((c) => c.callKey.startsWith("illustration:"))).toHaveLength(2);
    expect(await stub.summary()).toMatchObject({ image: null, status: "running" });
    expect((await api(`/api/runs/${id}/image`)).status).toBe(404);
  });

  test("an admin draws it again with today's model; anyone else may not", async () => {
    const { images } = fakes({
      catalog: [...CATALOG, catalogEntry("openai/gpt-image-2", "image")],
    });
    const { id, stub } = await paidRun(user());
    await runDurableObjectAlarm(stub);
    const first = (await stub.summary())?.image;
    await env.DB.prepare(
      "INSERT INTO model_settings (role, model_id, effort, updated_at, updated_by) VALUES ('image', 'openai/gpt-image', NULL, '', 'test')",
    ).run();
    const redraw = (headers: Record<string, string>) =>
      api(`/api/runs/${id}/image`, { method: "POST", headers });
    expect((await redraw(as("someone"))).status).toBe(403);
    const response = await redraw(as("boss", ["Admin"]));
    expect(response.status).toBe(200);
    const { image } = (await response.json()) as { image: string };
    expect(image).not.toBe(first);
    expect(images.calls.at(-1)?.model.id).toBe("openai/gpt-image-2");
    expect((await list()).runs.find((r) => r.id === id)?.image).toBe(image);
  });
});

describe("the questions of the home page", () => {
  test("lists the questions asked, newest first, with their pictures; not a quote, nor a deleted one", async () => {
    fakes();
    const owner = user();
    const quote = await quoted(owner);
    const older = await paidRun(owner);
    const newer = await paidRun(owner);
    await runDurableObjectAlarm(newer.stub);
    const runs = (await list()).runs;
    const ids = runs.map((r) => r.id);
    expect(ids).not.toContain(quote.id);
    expect(ids.indexOf(newer.id)).toBeLessThan(ids.indexOf(older.id));
    expect(runs.find((r) => r.id === newer.id)).toMatchObject({
      question: QUESTION,
      status: "running",
      image: (await newer.stub.summary())?.image,
    });
    expect(runs.find((r) => r.id === older.id)?.image).toBeNull();

    await api(`/api/runs/${older.id}`, { method: "DELETE", headers: as(owner) });
    expect((await list()).runs.map((r) => r.id)).not.toContain(older.id);
  });

  test("marks the reader's questions as theirs, and no one's for a signed-out reader", async () => {
    fakes();
    const owner = user();
    const { id } = await paidRun(owner);
    const mine = async (headers: Record<string, string> = {}) =>
      ((await (await api("/api/runs", { headers })).json()) as PublicList).runs.find(
        (r) => r.id === id,
      )?.mine;
    expect(await mine(as(owner))).toBe(true);
    expect(await mine(as(user()))).toBe(false);
    expect(await mine()).toBe(false);
  });

  test("pages through the list after the last run of a page", async () => {
    fakes();
    const owner = user();
    for (let n = 0; n < 3; n++) await paidRun(owner);
    const all: string[] = [];
    let page = await list();
    all.push(...page.runs.map((r) => r.id));
    while (page.next) {
      page = await list(`?after=${page.next}`);
      all.push(...page.runs.map((r) => r.id));
    }
    expect(new Set(all).size).toBe(all.length);
    expect((await api("/api/runs?after=nope")).status).toBe(400);
    expect((await api(`/api/runs?after=${crypto.randomUUID()}`)).status).toBe(404);
  });
});

test("an object created before the picture columns gets them when it is read again", async () => {
  fakes();
  const { stub } = await quoted("ana");
  await runInDurableObject(stub, (_: RunObject, state) => {
    for (const column of ["image", "image_type", "image_tries", "image_calls"])
      state.storage.sql.exec(`ALTER TABLE run DROP COLUMN ${column}`);
    state.storage.sql.exec("DROP TABLE image_chunks");
  });
  await runInDurableObject(stub, (_: RunObject, state) => {
    const store = new RunStore(state.storage.sql);
    expect(store.run()).toMatchObject({ owner: "ana", image: null, imageTries: 0, imageCalls: [] });
    store.saveImage({ bytes: new Uint8Array([1, 2, 3]), mediaType: "image/png", version: "v1" });
    expect(store.image()).toEqual({
      bytes: new Uint8Array([1, 2, 3]),
      mediaType: "image/png",
      version: "v1",
    });
  });
});
