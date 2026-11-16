// Live contract tests against Vercel AI Gateway: skipped without AI_GATEWAY_API_KEY.
// Tiny prompts and low output caps; a full run costs a few US cents per panel model.
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { z } from "zod";
import { type CatalogModel, fetchGatewayCatalog } from "./catalog.ts";
import { createGatewayProvider, normalizeUrl } from "./gateway.ts";
import { ProviderError } from "./provider.ts";
import { type ModelSnapshot, resolveModels } from "./resolve.ts";
import { MODEL_ROLES } from "./roles.ts";

const live = Boolean(process.env.AI_GATEWAY_API_KEY);
const TIMEOUT = 180_000;
const PANEL = ["panel.grok", "panel.claude", "panel.openai", "panel.gemini"] as const;

const report: Array<Record<string, unknown>> = [];

describe.skipIf(!live)("AI Gateway live contract", () => {
  let catalog: CatalogModel[];
  let snapshot: ModelSnapshot;
  const provider = createGatewayProvider();

  beforeAll(async () => {
    catalog = await fetchGatewayCatalog();
    snapshot = resolveModels([], catalog);
  });

  afterAll(() => {
    console.table(report);
  });

  test("the default model of every role is in the catalog with its kind", () => {
    for (const role of MODEL_ROLES)
      expect(catalog.find((model) => model.id === role.defaultId)?.type, role.key).toBe(role.kind);
    report.push({
      check: "snapshot",
      ...Object.fromEntries(Object.entries(snapshot).map(([k, v]) => [k, v.id])),
    });
  });

  describe.concurrent.each([...PANEL, "utility" as const])("%s", (role) => {
    test("schema round trip, with the cost the Gateway reports", { timeout: TIMEOUT }, async () => {
      const model = snapshot[role];
      const result = await provider.generate({
        callKey: `live:roundtrip:${role}`,
        model,
        system: "Answer briefly in the requested structure.",
        prompt: "What is 17 + 25? Give the number and how sure you are.",
        schema: z.object({ answer: z.string(), confidence: z.enum(["low", "medium", "high"]) }),
        maxOutputTokens: 4_000,
        signal: AbortSignal.timeout(120_000),
      });
      report.push({
        check: "roundtrip",
        model: model.id,
        effort: model.effort,
        latencyMs: result.latencyMs,
        costUsd: result.costUsd,
        ...result.usage,
        via: result.via,
      });
      expect(result.output.answer).toContain("42");
      expect(result.costUsd).toBeGreaterThan(0);
    });

    test("a short timeout aborts the call as a timeout", { timeout: TIMEOUT }, async () => {
      const started = Date.now();
      const error = await provider
        .generate({
          callKey: `live:abort:${role}`,
          model: snapshot[role],
          system: "Answer in the requested structure.",
          prompt: "Write a 300-word essay on the history of the number zero.",
          schema: z.object({ essay: z.string() }),
          maxOutputTokens: 2_000,
          signal: AbortSignal.timeout(300),
        })
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ProviderError);
      expect((error as ProviderError).kind).toBe("timeout");
      expect(Date.now() - started).toBeLessThan(5_000);
    });
  });

  describe.concurrent.each(PANEL)("%s", (role) => {
    test("search: sources come from the search tool, by object or submit", {
      timeout: TIMEOUT,
    }, async () => {
      const model = snapshot[role];
      const result = await provider
        .generate({
          callKey: `live:search:${role}`,
          model,
          system:
            "Search the web once, then answer in the requested structure. List the URLs you used in sources.",
          prompt: "Who won the most recent Formula 1 drivers' championship, and in which year?",
          schema: z.object({ answer: z.string(), sources: z.array(z.string()) }),
          maxOutputTokens: 4_000,
          search: { maxResults: 3 },
          signal: AbortSignal.timeout(150_000),
        })
        .catch((error: unknown) => {
          if (error instanceof ProviderError)
            report.push({
              check: "search",
              model: model.id,
              error: error.kind,
              message: error.message.slice(0, 160),
              costUsd: error.costUsd,
              latencyMs: error.latencyMs,
            });
          throw error;
        });
      // A URL the model typed that is not among the results of its search is dropped.
      const kept = new Set(result.sources.map((source) => normalizeUrl(source.url)));
      const dropped = result.output.sources.filter((url) => !kept.has(normalizeUrl(url)));
      report.push({
        check: "search",
        model: model.id,
        via: result.via,
        latencyMs: result.latencyMs,
        costUsd: result.costUsd,
        ...result.usage,
        sources: result.sources.length,
        typedUrls: result.output.sources.length,
        dropped: dropped.join(" "),
      });
      expect(result.costUsd).toBeGreaterThan(0);
      for (const source of result.sources) {
        expect(source.url).toMatch(/^https?:\/\//);
        expect(source.title).not.toBe("");
      }
    });
  });
});
