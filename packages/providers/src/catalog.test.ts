import { expect, test } from "vitest";
import { cachedCatalog, fetchGatewayCatalog, GATEWAY_MODELS_URL, parseCatalog } from "./catalog.ts";

test("parseCatalog keeps id, name, kind, tags and effort values, sorted by id", () => {
  const models = parseCatalog({
    data: [
      {
        id: "spacexai/grok-4.7",
        name: "Grok 4.7",
        type: "language",
        tags: ["tool-use", 1],
        reasoning_options: [{ type: "effort", values: ["none", "low", "high"] }],
      },
      { id: "google/gemini-3.5-flash-lite", type: "language" },
      { name: "no id" },
    ],
  });
  expect(models).toEqual([
    {
      id: "google/gemini-3.5-flash-lite",
      name: "google/gemini-3.5-flash-lite",
      type: "language",
      tags: [],
      efforts: [],
    },
    {
      id: "spacexai/grok-4.7",
      name: "Grok 4.7",
      type: "language",
      tags: ["tool-use"],
      efforts: ["low", "high"],
    },
  ]);
  expect(() => parseCatalog({ models: [] })).toThrow(/shape/);
});

test("decision models are kept: the Gateway's evaluation type is read as decision", () => {
  const models = parseCatalog({
    data: [
      { id: "typesafe-ai/jev", type: "evaluation" },
      { id: "openai/gpt-6-luna-decisions", type: "decision" },
      { id: "openai/text-embedding-3", type: "embedding" },
    ],
  });
  expect(models.map((m) => [m.id, m.type])).toEqual([
    ["openai/gpt-6-luna-decisions", "decision"],
    ["openai/text-embedding-3", "embedding"],
    ["typesafe-ai/jev", "decision"],
  ]);
});

test("fetchGatewayCatalog reads the Gateway's models endpoint with a timeout", async () => {
  const urls: string[] = [];
  const request = (async (url: string | URL | Request, init?: RequestInit) => {
    urls.push(String(url));
    expect(init?.signal).toBeDefined();
    return Response.json({ data: [{ id: "test/model-1", type: "language" }] });
  }) as typeof fetch;
  expect((await fetchGatewayCatalog(request)).map((m) => m.id)).toEqual(["test/model-1"]);
  expect(urls).toEqual([GATEWAY_MODELS_URL]);
  await expect(
    fetchGatewayCatalog((async () => new Response("", { status: 503 })) as typeof fetch),
  ).rejects.toThrow(/503/);
  await expect(
    fetchGatewayCatalog((async () => Response.json({ data: [] })) as typeof fetch),
  ).rejects.toThrow(/empty/);
});

test("catalog cache coalesces reads, refreshes after TTL and retries failures", async () => {
  let time = 0;
  let calls = 0;
  let fail = false;
  const value = [{ id: "a/b-1", name: "b", type: "language", tags: [], efforts: [] }];
  const read = cachedCatalog(
    async () => {
      calls++;
      if (fail) throw new Error("offline");
      return value;
    },
    100,
    () => time,
  );
  await Promise.all([read(), read(), read()]);
  expect(calls).toBe(1);
  time = 99;
  await read();
  expect(calls).toBe(1);
  time = 100;
  await read();
  expect(calls).toBe(2);
  fail = true;
  time = 200;
  expect(await read()).toEqual(value);
  expect(calls).toBe(3);
  time = 300;
  fail = false;
  await read();
  expect(calls).toBe(4);
  const empty = cachedCatalog(async () => {
    throw new Error("offline");
  });
  await expect(empty()).rejects.toThrow(/offline/);
});
