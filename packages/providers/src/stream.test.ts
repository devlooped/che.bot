import { convertArrayToReadableStream, MockLanguageModelV4 } from "ai/test";
import { expect, test } from "vitest";
import { z } from "zod";
import { createGatewayProvider, progressOptions } from "./gateway.ts";
import { ProviderError } from "./provider.ts";
import { assemble, JsonProse } from "./stream.ts";

type StreamResult = Awaited<ReturnType<MockLanguageModelV4["doStream"]>>;
type Part = StreamResult["stream"] extends ReadableStream<infer P> ? P : never;

const schema = z.object({ answer: z.string() });

const finish: Part = {
  type: "finish",
  finishReason: { unified: "stop", raw: undefined },
  usage: {
    inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 5, text: 5, reasoning: undefined },
  },
  providerMetadata: { gateway: { cost: "0.002" } },
};

/** A model that only streams: each doStream call plays the next list of parts. */
function streaming(...calls: Part[][]) {
  let index = 0;
  return new MockLanguageModelV4({
    doGenerate: async () => {
      throw new Error("a call with progress streams");
    },
    doStream: async () => ({
      stream: convertArrayToReadableStream(calls[Math.min(index++, calls.length - 1)] ?? []),
    }),
  });
}

const ask = (model: MockLanguageModelV4, said: string[], id = "openai/gpt-6.1-sol") =>
  createGatewayProvider({ apiKey: "test", languageModel: () => model, retryDelayMs: 0 }).generate({
    callKey: "draft:0:openai",
    model: { id, effort: "medium" },
    system: "Answer.",
    prompt: "What is the figure?",
    schema,
    maxOutputTokens: 500,
    signal: new AbortController().signal,
    onProgress: (text) => said.push(text),
  });

test("a call with progress streams, and tells its reasoning but not its JSON", async () => {
  const model = streaming([
    { type: "stream-start", warnings: [] },
    { type: "reasoning-start", id: "r1" },
    { type: "reasoning-delta", id: "r1", delta: "Busco la " },
    { type: "reasoning-delta", id: "r1", delta: "cifra." },
    { type: "reasoning-end", id: "r1" },
    { type: "text-start", id: "t2" },
    { type: "text-delta", id: "t2", delta: '{"answer":' },
    { type: "text-delta", id: "t2", delta: '"42"}' },
    { type: "text-end", id: "t2" },
    finish,
  ]);
  const said: string[] = [];
  const result = await ask(model, said);
  expect(result.output).toEqual({ answer: "42" });
  expect(result.costUsd).toBeCloseTo(0.002);
  expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
  expect(said.join("")).toBe("Busco la cifra.");
  expect(model.doStreamCalls).toHaveLength(1);
  expect(model.doStreamCalls[0]?.providerOptions).toEqual({
    openai: { reasoningEffort: "medium", reasoningSummary: "auto" },
  });
});

test("the stream comes back as the content of one result; prose is told, tool calls are not", async () => {
  const said: string[] = [];
  const result = await assemble(
    {
      stream: convertArrayToReadableStream<Part>([
        { type: "stream-start", warnings: [] },
        { type: "response-metadata", id: "resp-1", modelId: "m" },
        { type: "text-start", id: "t1" },
        { type: "text-delta", id: "t1", delta: "  \n" },
        { type: "text-delta", id: "t1", delta: "Busco **la** cifra." },
        { type: "text-end", id: "t1" },
        { type: "tool-input-start", id: "s1", toolName: "web_search", providerExecuted: true },
        { type: "tool-input-delta", id: "s1", delta: '{"objective":"x"}' },
        { type: "tool-input-end", id: "s1" },
        {
          type: "tool-call",
          toolCallId: "s1",
          toolName: "web_search",
          input: '{"objective":"x"}',
          providerExecuted: true,
        },
        { type: "reasoning-start", id: "r1" },
        { type: "reasoning-delta", id: "r1", delta: "La encontré." },
        {
          type: "reasoning-delta",
          id: "r1",
          delta: "",
          providerMetadata: { a: { signature: "s" } },
        },
        { type: "reasoning-end", id: "r1" },
        finish,
      ]),
    },
    (text) => said.push(text),
  );
  expect(said.join("")).toBe("Busco **la** cifra.\n\nLa encontré.");
  expect(result.content).toEqual([
    { type: "text", text: "  \nBusco **la** cifra." },
    {
      type: "tool-call",
      toolCallId: "s1",
      toolName: "web_search",
      input: '{"objective":"x"}',
      providerExecuted: true,
    },
    { type: "reasoning", text: "La encontré.", providerMetadata: { a: { signature: "s" } } },
  ]);
  expect(result.response).toEqual({ id: "resp-1", modelId: "m" });
  expect(result.finishReason.unified).toBe("stop");
});

test("an error in the stream fails the call as any other error", async () => {
  const model = streaming([
    { type: "reasoning-start", id: "r1" },
    { type: "reasoning-delta", id: "r1", delta: "Pienso." },
    { type: "error", error: new Error("the connection dropped") },
  ]);
  const said: string[] = [];
  const error = await ask(model, said).catch((e: unknown) => e);
  expect(ProviderError.isInstance(error) && error.kind).toBe("error");
  expect(said).toEqual(["Pienso."]);
});

test("the reasoning of OpenAI and Gemini is asked for; a model without an effort asks nothing", () => {
  expect(progressOptions({ id: "google/gemini-4-argon", effort: "high" })).toEqual({
    google: { thinkingConfig: { thinkingLevel: "high", includeThoughts: true } },
  });
  expect(progressOptions({ id: "anthropic/claude-opus-5.5", effort: "medium" })).toEqual({
    anthropic: { effort: "medium", thinking: { type: "adaptive", display: "summarized" } },
  });
  expect(progressOptions({ id: "openai/gpt-6.1-sol", effort: null })).toBeUndefined();
});

test("the prose of the string values of a JSON output is told as it streams; keys, labels and URLs are not", () => {
  const said: string[] = [];
  const json = new JsonProse((text, first) => said.push(first ? `|${text}` : text));
  const output = JSON.stringify({
    answer: 'Mide 6.960,8 m.\n\nLo midió "UNCuyo" en 2012 ✓',
    claims: [{ text: "La cifra oficial es del IGN.", confidence: "high" }],
    sources: ["https://www.ign.gob.ar/una/pagina/larga"],
    verdict: { kind: "fact", rating: "none" },
  });
  for (let i = 0; i < output.length; i += 7) json.push(output.slice(i, i + 7));
  expect(said.join("")).toBe(
    '|Mide 6.960,8 m.\n\nLo midió "UNCuyo" en 2012 ✓|La cifra oficial es del IGN.',
  );
});

test("a unicode escape of JSON is decoded, even split across deltas", () => {
  const said: string[] = [];
  const json = new JsonProse((text) => said.push(text));
  for (const delta of ['{"a":"La respuesta est', "\\u00", 'e1 lista, sin duda."}'])
    json.push(delta);
  expect(said.join("")).toBe("La respuesta está lista, sin duda.");
});
