import { APICallError } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { expect, test } from "vitest";
import { z } from "zod";
import { citedSources, createGatewayProvider, effortOptions, gatewayCost } from "./gateway.ts";
import { type GenerateRequest, ProviderError } from "./provider.ts";

type GenerateResult = Awaited<ReturnType<MockLanguageModelV4["doGenerate"]>>;
type Content = GenerateResult["content"];

const schema = z.object({ answer: z.string(), sources: z.array(z.string()) });

const reply = (
  content: Content,
  { cost = "0.001", finish = "stop" as GenerateResult["finishReason"]["unified"] } = {},
): GenerateResult => ({
  content,
  finishReason: { unified: finish, raw: undefined },
  usage: {
    inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 5, text: 5, reasoning: undefined },
  },
  warnings: [],
  providerMetadata: { gateway: { cost } },
});

const json = (value: unknown): Content => [{ type: "text", text: JSON.stringify(value) }];

const searched = (text: string): Content => [
  {
    type: "tool-call",
    toolCallId: "s1",
    toolName: "web_search",
    input: '{"objective":"x"}',
    providerExecuted: true,
  },
  {
    type: "tool-result",
    toolCallId: "s1",
    toolName: "web_search",
    result: {
      search_id: "search_1",
      results: [
        {
          url: "https://www.example.org/report/",
          title: "\n   Report\n  ",
          publish_date: null,
          excerpts: ["The  figure is\n42."],
        },
        { url: "https://other.example/page", title: null, excerpts: [] },
      ],
    },
  },
  { type: "text", text },
];

/** A mock model that answers each doGenerate call with the next scripted reply or error. */
function scripted(
  ...steps: Array<GenerateResult | Error | ((signal?: AbortSignal) => Promise<GenerateResult>)>
) {
  let index = 0;
  return new MockLanguageModelV4({
    doGenerate: async (options) => {
      const step = steps[Math.min(index++, steps.length - 1)];
      if (!step || step instanceof Error) throw step ?? new Error("no scripted step");
      return typeof step === "function" ? step(options.abortSignal) : step;
    },
  });
}

const request = (
  over: Partial<GenerateRequest<z.infer<typeof schema>>> = {},
): GenerateRequest<z.infer<typeof schema>> => ({
  callKey: "draft:0:grok",
  model: { id: "spacexai/grok-4.7", effort: "medium" },
  system: "Answer.",
  prompt: "What is the figure?",
  schema,
  maxOutputTokens: 500,
  signal: new AbortController().signal,
  ...over,
});

const provider = (model: MockLanguageModelV4) =>
  createGatewayProvider({ apiKey: "test", languageModel: () => model, retryDelayMs: 0 });

const failure = async (promise: Promise<unknown>): Promise<ProviderError> => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ProviderError) return error;
    throw error;
  }
  throw new Error("expected a ProviderError");
};

const httpError = (statusCode: number) =>
  new APICallError({
    message: `HTTP ${statusCode}`,
    url: "https://gateway.test",
    requestBodyValues: {},
    statusCode,
  });

test("returns the object, the usage, the Gateway cost and no retries by the SDK", async () => {
  const model = scripted(reply(json({ answer: "42", sources: [] }), { cost: "0.0025" }));
  const result = await provider(model).generate(request());
  expect(result.output).toEqual({ answer: "42", sources: [] });
  expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
  expect(result.costUsd).toBeCloseTo(0.0025);
  expect(result.via).toBe("output");
  expect(result.sources).toEqual([]);
  expect(model.doGenerateCalls).toHaveLength(1);
  const [call] = model.doGenerateCalls;
  if (!call) throw new Error("no call");
  expect(call.responseFormat).toMatchObject({ type: "json" });
  expect(call.providerOptions).toEqual({ xai: { reasoningEffort: "medium" } });
  expect(call.tools ?? []).toEqual([]);
});

test("an object that does not match the schema is invalid, not retried", async () => {
  const model = scripted(reply(json({ answer: 42 })));
  const error = await failure(provider(model).generate(request()));
  expect(error.kind).toBe("invalid");
  expect(error.costUsd).toBeCloseTo(0.001);
  expect(model.doGenerateCalls).toHaveLength(1);
});

test("a content filter is a refusal, not retried", async () => {
  const model = scripted(reply([{ type: "text", text: "" }], { finish: "content-filter" }));
  const error = await failure(provider(model).generate(request()));
  expect(error.kind).toBe("refusal");
  expect(model.doGenerateCalls).toHaveLength(1);
});

test("a 429 or a 5xx is retried once, and the cost of the call sums both attempts", async () => {
  const once = scripted(
    httpError(429),
    reply(json({ answer: "ok", sources: [] }), { cost: "0.002" }),
  );
  const result = await provider(once).generate(request());
  expect(result.output.answer).toBe("ok");
  expect(once.doGenerateCalls).toHaveLength(2);

  const twice = scripted(
    httpError(503),
    httpError(500),
    reply(json({ answer: "never", sources: [] })),
  );
  const error = await failure(provider(twice).generate(request()));
  expect(error.kind).toBe("error");
  expect(twice.doGenerateCalls).toHaveLength(2);

  const client = scripted(httpError(400), reply(json({ answer: "never", sources: [] })));
  expect((await failure(provider(client).generate(request()))).kind).toBe("error");
  expect(client.doGenerateCalls).toHaveLength(1);
});

test("the signal bounds the call and the retry: an abort is a timeout", async () => {
  const hang = (signal?: AbortSignal) =>
    new Promise<GenerateResult>((_, reject) =>
      signal?.addEventListener("abort", () => reject(signal.reason), { once: true }),
    );
  const model = scripted(hang);
  const error = await failure(
    provider(model).generate(request({ signal: AbortSignal.timeout(20) })),
  );
  expect(error.kind).toBe("timeout");

  const slowRetry = createGatewayProvider({
    apiKey: "test",
    languageModel: () => scripted(httpError(429), reply(json({ answer: "late", sources: [] }))),
    retryDelayMs: 5_000,
  });
  const started = Date.now();
  expect(
    (await failure(slowRetry.generate(request({ signal: AbortSignal.timeout(20) })))).kind,
  ).toBe("timeout");
  expect(Date.now() - started).toBeLessThan(2_000);
});

test("with search, the tool is sent, and only search results the output cites are sources", async () => {
  const model = scripted(
    reply(
      searched(
        JSON.stringify({
          answer: "42, per https://example.org/report.",
          sources: ["https://example.org/report#top", "https://invented.example/fake"],
        }),
      ),
      { cost: "0.012" },
    ),
  );
  const result = await provider(model).generate(request({ search: { maxResults: 3 } }));
  expect(result.via).toBe("output");
  expect(result.costUsd).toBeCloseTo(0.012);
  expect(result.sources).toEqual([
    { url: "https://www.example.org/report/", title: "Report", quote: "The figure is 42." },
  ]);
  const tools = model.doGenerateCalls[0]?.tools ?? [];
  expect(tools.map((t) => t.name)).toEqual(["web_search"]);
  expect(tools[0]).toMatchObject({ type: "provider", args: { maxResults: 3 } });
});

test("when the object does not come back after a search, the submit tool carries the schema", async () => {
  const model = scripted(
    reply(searched("The figure is 42, see https://example.org/report."), { cost: "0.01" }),
    reply(
      [
        {
          type: "tool-call",
          toolCallId: "c1",
          toolName: "submit",
          input: JSON.stringify({
            answer: "42",
            sources: ["https://example.org/report", "https://made.up/x"],
          }),
        },
      ],
      { cost: "0.003", finish: "tool-calls" },
    ),
  );
  const result = await provider(model).generate(request({ search: { maxResults: 3 } }));
  expect(result.via).toBe("submit");
  expect(result.output).toEqual({
    answer: "42",
    sources: ["https://example.org/report", "https://made.up/x"],
  });
  expect(result.sources.map((s) => s.url)).toEqual(["https://www.example.org/report/"]);
  expect(result.costUsd).toBeCloseTo(0.013);
  expect(result.usage).toEqual({ inputTokens: 20, outputTokens: 10 });
  const fallback = model.doGenerateCalls[1];
  if (!fallback) throw new Error("no fallback call");
  expect((fallback.tools ?? []).map((t) => t.name)).toEqual(["submit"]);
  expect(fallback.toolChoice).toEqual({ type: "auto" });
  expect(fallback.responseFormat?.type ?? "text").toBe("text");
  expect(JSON.stringify(fallback.prompt)).toContain("https://www.example.org/report/");
});

test("an invalid submit is invalid; without a search there is no fallback", async () => {
  const bad = scripted(
    reply(searched("prose")),
    reply([{ type: "tool-call", toolCallId: "c1", toolName: "submit", input: '{"answer":1}' }], {
      finish: "tool-calls",
    }),
  );
  expect((await failure(provider(bad).generate(request({ search: { maxResults: 3 } })))).kind).toBe(
    "invalid",
  );

  const noSearch = scripted(reply([{ type: "text", text: "prose" }]));
  expect(
    (await failure(provider(noSearch).generate(request({ search: { maxResults: 3 } })))).kind,
  ).toBe("invalid");
  expect(noSearch.doGenerateCalls).toHaveLength(1);
});

test("effort options per provider, as courtModel() sets them", () => {
  expect(effortOptions({ id: "spacexai/grok-4.7", effort: "high" })).toEqual({
    xai: { reasoningEffort: "high" },
  });
  expect(effortOptions({ id: "google/gemini-4-argon", effort: "low" })).toEqual({
    google: { thinkingConfig: { thinkingLevel: "low" } },
  });
  expect(effortOptions({ id: "anthropic/claude-opus-5.5", effort: "medium" })).toEqual({
    anthropic: { effort: "medium" },
  });
  expect(effortOptions({ id: "openai/gpt-6.1-sol", effort: "medium" })).toEqual({
    openai: { reasoningEffort: "medium" },
  });
  expect(effortOptions({ id: "deepseek/deepseek-v4", effort: "high" })).toBeUndefined();
  expect(effortOptions({ id: "openai/gpt-6.1-sol", effort: null })).toBeUndefined();
});

test("the spend of a step is the larger of cost and marketCost (BYOK reports cost 0 for the tokens)", () => {
  expect(gatewayCost({ gateway: { cost: "0.0055", marketCost: "0.0055" } })).toBeCloseTo(0.0055);
  expect(gatewayCost({ gateway: { cost: "0.005", marketCost: "0.0105" } })).toBeCloseTo(0.0105);
  expect(gatewayCost({ gateway: { cost: "0.0012", marketCost: "0.001" } })).toBeCloseTo(0.0012);
  expect(gatewayCost({ gateway: { cost: "0" } })).toBe(0);
  expect(gatewayCost({ xai: {} })).toBeUndefined();
  expect(gatewayCost(undefined)).toBeUndefined();
});

test("a cited URL matches its search result without fragment, www. or trailing slash", () => {
  const found = new Map([
    ["example.org/a", { url: "https://example.org/a", title: "A", quote: "" }],
  ]);
  expect(citedSources({ nested: [{ text: "see (https://example.org/a)." }] }, found)).toHaveLength(
    1,
  );
  expect(citedSources({ text: "https://www.example.org/a/#top" }, found)).toEqual([
    { url: "https://example.org/a", title: "A", quote: "" },
  ]);
  expect(citedSources({ text: "https://example.org/b" }, found)).toHaveLength(0);
});
