import { expect, test } from "vitest";
import { z } from "zod";
import { FakeProvider } from "./fake.ts";
import { type GenerateRequest, ProviderError } from "./provider.ts";

const schema = z.object({ answer: z.string() });
const request = (
  callKey: string,
  signal = new AbortController().signal,
): GenerateRequest<{ answer: string }> => ({
  callKey,
  model: { id: "test/model-1", effort: null },
  system: "system",
  prompt: `prompt of ${callKey}`,
  schema,
  maxOutputTokens: 100,
  signal,
});

const failure = async (promise: Promise<unknown>): Promise<ProviderError> => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ProviderError) return error;
    throw error;
  }
  throw new Error("expected a ProviderError");
};

test("returns canned outputs by exact key or by a function of the request, parsed by the schema", async () => {
  const fake = new FakeProvider({
    calls: {
      "draft:0:grok": {
        output: { answer: "a" },
        costUsd: 0.01,
        sources: [{ url: "https://a.example", title: "A", quote: "q" }],
      },
    },
    respond: (req) => ({ output: { answer: req.callKey.toUpperCase() } }),
    costUsd: 0.002,
  });
  const first = await fake.generate(request("draft:0:grok"));
  expect(first.output).toEqual({ answer: "a" });
  expect(first.costUsd).toBe(0.01);
  expect(first.sources).toHaveLength(1);
  const second = await fake.generate(request("draft:0:claude"));
  expect(second.output).toEqual({ answer: "DRAFT:0:CLAUDE" });
  expect(second.costUsd).toBe(0.002);
  expect(fake.calls.map((call) => [call.callKey, call.result, call.costUsd])).toEqual([
    ["draft:0:grok", "output", 0.01],
    ["draft:0:claude", "output", 0.002],
  ]);
});

test("an invalid canned output fails as invalid, like the real adapter", async () => {
  const fake = new FakeProvider({ calls: { k: { output: { answer: 42 }, costUsd: 0.003 } } });
  const error = await failure(fake.generate(request("k")));
  expect(error.kind).toBe("invalid");
  expect(error.costUsd).toBe(0.003);
});

test("refusals, errors and unscripted keys fail with their kind", async () => {
  const fake = new FakeProvider({
    calls: { r: { kind: "refusal" }, e: { kind: "error", message: "boom" } },
  });
  expect((await failure(fake.generate(request("r")))).kind).toBe("refusal");
  const error = await failure(fake.generate(request("e")));
  expect([error.kind, error.message]).toEqual(["error", "boom"]);
  expect((await failure(fake.generate(request("unknown")))).kind).toBe("error");
});

test("a timeout waits for the signal, and a delay longer than the signal ends as a timeout", async () => {
  const fake = new FakeProvider({
    calls: {
      hang: { kind: "timeout" },
      slow: { output: { answer: "late" }, delayMs: 10_000 },
      quick: { output: { answer: "ok" }, delayMs: 5 },
    },
  });
  const started = Date.now();
  expect((await failure(fake.generate(request("hang", AbortSignal.timeout(30))))).kind).toBe(
    "timeout",
  );
  expect((await failure(fake.generate(request("slow", AbortSignal.timeout(30))))).kind).toBe(
    "timeout",
  );
  expect(Date.now() - started).toBeLessThan(2_000);
  expect((await fake.generate(request("quick", AbortSignal.timeout(1_000)))).output).toEqual({
    answer: "ok",
  });
});

test("records every call, so a test can assert each key was requested exactly once", async () => {
  const fake = new FakeProvider({
    respond: (req, attempt) =>
      req.callKey === "a" && attempt === 0 ? { kind: "error" } : { output: { answer: "retried" } },
  });
  await failure(fake.generate(request("a")));
  await fake.generate(request("b"));
  expect(fake.repeated()).toEqual([]);
  expect((await fake.generate(request("a"))).output).toEqual({ answer: "retried" });
  expect(fake.repeated()).toEqual(["a"]);
  expect(fake.counts().get("a")).toBe(2);
});

test("streams the thoughts of an outcome to onProgress across its delay, a paragraph after a blank line", async () => {
  const said: string[] = [];
  const fake = new FakeProvider({
    respond: () => ({
      output: { answer: "a" },
      delayMs: 20,
      thoughts: ["Busco la cifra.", "La tengo."],
    }),
  });
  const result = await fake.generate({
    ...request("draft:0:grok"),
    onProgress: (text) => said.push(text),
  });
  expect(result.output).toEqual({ answer: "a" });
  expect(said).toEqual(["Busco", " la", " cifra.", "\n\nLa", " tengo."]);
  // without a listener, the thoughts are only a delay
  await expect(fake.generate(request("draft:1:grok"))).resolves.toMatchObject({
    output: { answer: "a" },
  });
});
