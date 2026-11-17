import { env } from "cloudflare:workers";
import { CATALOG, catalogEntry } from "@chebot/driver/testing";
import {
  classify,
  createGatewayProvider,
  type GenerateRequest,
  ProviderError,
} from "@chebot/providers";
import { MockLanguageModelV4 } from "ai/test";
import { expect, test } from "vitest";
import { z } from "zod";
import { budgetOverride } from "../src/worker/deps.ts";
import { priceOf, readPrices, resolveRunModels } from "../src/worker/settings.ts";
import { fakes } from "./helpers.ts";

// The AI SDK and the Gateway adapter in the Workers runtime, and the settings in D1. No network:
// a fake fetch stands for the Gateway.

const request = (signal = AbortSignal.timeout(5_000)): GenerateRequest<{ answer: string }> => ({
  callKey: "draft:0:claude",
  model: { id: "anthropic/claude-opus-5.5", effort: "medium" },
  system: "Answer.",
  prompt: "¿Cuánto es 6 por 7?",
  schema: z.object({ answer: z.string() }),
  maxOutputTokens: 100,
  signal,
});

test("the Gateway adapter sends a real Gateway request from the Workers runtime", async () => {
  const sent: Request[] = [];
  const provider = createGatewayProvider({
    apiKey: "test-key",
    fetch: async (input, init) => {
      sent.push(new Request(input, init));
      return Response.json(
        { error: { message: "Invalid API key", type: "authentication_error" } },
        { status: 401 },
      );
    },
  });
  const failure = await provider.generate(request()).catch((error: unknown) => error);
  expect(ProviderError.isInstance(failure)).toBe(true);
  expect((failure as ProviderError).kind).toBe("error");
  expect(sent).toHaveLength(1);
  expect(sent[0]?.url).toMatch(/^https:\/\/ai-gateway\.vercel\.sh\//);
  expect(sent[0]?.headers.get("authorization")).toBe("Bearer test-key");
});

test("a structured call goes through generateText, Output.object and Zod in the Workers runtime", async () => {
  const provider = createGatewayProvider({
    languageModel: () =>
      new MockLanguageModelV4({
        doGenerate: async () => ({
          content: [{ type: "text", text: JSON.stringify({ answer: "42" }) }],
          finishReason: { unified: "stop", raw: undefined },
          usage: {
            inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
            outputTokens: { total: 5, text: 5, reasoning: undefined },
          },
          warnings: [],
          providerMetadata: { gateway: { cost: "0.0012" } },
        }),
      }),
  });
  const result = await provider.generate(request());
  expect(result.output).toEqual({ answer: "42" });
  expect(result.costUsd).toBeCloseTo(0.0012, 9);
  expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
});

test("an aborted signal ends a call as a timeout in the Workers runtime", async () => {
  const provider = createGatewayProvider({
    languageModel: () =>
      new MockLanguageModelV4({
        doGenerate: (options) =>
          new Promise((_, reject) =>
            options.abortSignal?.addEventListener("abort", () =>
              reject(options.abortSignal?.reason),
            ),
          ),
      }),
  });
  const failure = await provider
    .generate(request(AbortSignal.timeout(20)))
    .catch((error: unknown) => error);
  expect((failure as ProviderError).kind).toBe("timeout");
});

test("the classifier builds its Gateway decision request in the Workers runtime", async () => {
  const sent: string[] = [];
  const failure = await classify(
    {
      question: "¿Cuál es la capital de Australia?",
      model: { id: "typesafe-ai/jev-1.14.0", effort: null },
      signal: AbortSignal.timeout(5_000),
    },
    {
      apiKey: "test-key",
      fetch: async (input) => {
        sent.push(new Request(input).url);
        return Response.json({ error: { message: "nope" } }, { status: 401 });
      },
    },
  ).catch((error: unknown) => error);
  expect(ProviderError.isInstance(failure)).toBe(true);
  expect(sent[0]).toMatch(/^https:\/\/ai-gateway\.vercel\.sh\//);
});

test("the migrations set the two prices", async () => {
  expect(await readPrices(env.DB)).toEqual([
    { class: "simple", amount: 5000, currency: "ARS" },
    { class: "complex", amount: 10000, currency: "ARS" },
  ]);
  expect(await priceOf(env.DB, "complex")).toEqual({
    class: "complex",
    amount: 10000,
    currency: "ARS",
  });
});

test("the snapshot of a run resolves each setting's family to the newest model of the catalog", async () => {
  fakes({ catalog: [...CATALOG, catalogEntry("anthropic/claude-opus-5.6")] });
  await env.DB.prepare(
    "INSERT INTO model_settings (role, model_id, effort, updated_at, updated_by) VALUES (?, ?, ?, ?, ?)",
  )
    .bind("panel.claude", "anthropic/claude-opus-5.4", "high", "2026-11-16T00:00:00Z", "admin")
    .run();
  const models = await resolveRunModels(env);
  expect(models["panel.claude"]).toEqual({ id: "anthropic/claude-opus-5.6", effort: "high" });
  expect(models["panel.grok"]).toEqual({ id: "spacexai/grok-4.7", effort: "low" });
  expect(models.classifier).toEqual({ id: "typesafe-ai/jev", effort: null });
});

test("RUN_BUDGET_USD overrides the budget of the protocol's config; empty keeps the default", () => {
  expect(budgetOverride({ RUN_BUDGET_USD: "" })).toEqual({});
  expect(budgetOverride({ RUN_BUDGET_USD: " 1.5 " })).toEqual({ budgetUsd: 1.5 });
  expect(() => budgetOverride({ RUN_BUDGET_USD: "free" })).toThrow(/RUN_BUDGET_USD/);
});
