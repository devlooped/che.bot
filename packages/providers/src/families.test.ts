import { expect, test } from "vitest";
import type { CatalogModel } from "./catalog.ts";
import { latestFamilyModels, latestModel, modelFamily } from "./families.ts";

const model = (id: string, type = "language", efforts: string[] = []): CatalogModel => ({
  id,
  name: id,
  type,
  tags: [],
  efforts,
});

test("removes versions while retaining all flavor words and providers", () => {
  for (const [id, family] of [
    ["anthropic/claude-opus-4.7", "anthropic/opus"],
    ["anthropic/opus-4.7", "anthropic/opus"],
    ["google/gemini-4-argon", "google/gemini-argon"],
    ["google/gemini-3.5-flash-lite", "google/gemini-flash-lite"],
    ["deepseek/deepseek-v4.1-flash-1017-fast", "deepseek/deepseek-flash-fast"],
    ["openai/gpt-4o-mini", "openai/gpt-o-mini"],
    ["openai/gpt-6.1-sol", "openai/gpt-sol"],
    ["alibaba/qwen3-coder-30b-a3b", "alibaba/qwen-coder-30b-a3b"],
    ["moonshotai/kimi-k2.5", "moonshotai/kimi-k"],
    ["zai/glm-4.5v", "zai/glm-v"],
    ["openai/o3-mini", "openai/o-mini"],
    ["anthropic/claude-3-7-sonnet", "anthropic/sonnet"],
    ["anthropic/claude-opus-5.5-batch", "anthropic/opus-batch"],
    ["spacexai/grok-imagine-image-2.0", "spacexai/grok-imagine-image"],
    ["google/gemini-flash", "google/gemini-flash"],
    ["typesafe-ai/jev-1.14.0", "typesafe-ai/jev"],
  ] as const)
    expect(modelFamily(id)).toBe(family);
});

test("numeric versions, revisions and flavors determine the latest model, independent of order", () => {
  const catalog = [
    model("deepseek/deepseek-v4.9-flash", "language", ["low"]),
    model("deepseek/deepseek-v4.10-flash", "language", ["high"]),
    model("deepseek/deepseek-v4.10-flash-1017", "language", ["max"]),
    model("deepseek/deepseek-v4-flash-0731"),
    model("deepseek/deepseek-v9-pro"),
    model("deepseek/deepseek-v9-flash-fast"),
    model("anthropic/claude-opus-4.7"),
    model("anthropic/claude-opus-5.5"),
    model("anthropic/claude-opus-5.5-fast"),
    model("anthropic/claude-opus"),
  ];
  expect(latestModel("deepseek/deepseek-v4-flash", catalog)?.id).toBe(
    "deepseek/deepseek-v4.10-flash-1017",
  );
  expect(
    latestModel("deepseek/deepseek-flash", [
      model("deepseek/deepseek-v4-flash-0731"),
      model("deepseek/deepseek-v4.1-flash"),
    ])?.id,
  ).toBe("deepseek/deepseek-v4.1-flash");
  expect(
    latestModel("alibaba/qwen-coder", [
      model("alibaba/qwen3-coder"),
      model("alibaba/qwen3.5-coder"),
    ])?.id,
  ).toBe("alibaba/qwen3.5-coder");
  expect(
    latestModel("openai/gpt-o-mini", [model("openai/gpt-4o-mini"), model("openai/gpt-5-mini")])?.id,
  ).toBe("openai/gpt-4o-mini");
  expect(latestModel("deepseek/deepseek-flash-fast", catalog)?.id).toBe(
    "deepseek/deepseek-v9-flash-fast",
  );
  expect(latestModel("anthropic/claude-opus-4.7", catalog)?.id).toBe("anthropic/claude-opus-5.5");
  expect(latestModel("anthropic/opus-4.7", catalog)?.id).toBe("anthropic/claude-opus-5.5");
  expect(latestModel("anthropic/claude-opus-fast", catalog)?.id).toBe(
    "anthropic/claude-opus-5.5-fast",
  );
  expect(latestModel("other/claude-opus", catalog)).toBeUndefined();

  const families = latestFamilyModels(catalog);
  expect(families.find((m) => m.id === "deepseek/deepseek-flash")?.efforts[0]).toBe("max");
  expect(families.filter((m) => m.id === "deepseek/deepseek-flash")).toHaveLength(1);
  expect(families.every((m) => m.id === modelFamily(m.id) && m.name === m.id)).toBe(true);
  expect(
    latestFamilyModels([model("test/model-1"), model("test/model-2", "image")])
      .map((m) => m.type)
      .sort(),
  ).toEqual(["image", "language"]);
});

test("a versioned model is newer than the unversioned alias of its family", () => {
  const catalog = [
    model("typesafe-ai/jev", "decision"),
    model("typesafe-ai/jev-1.13.0", "decision"),
    model("typesafe-ai/jev-1.14.0", "decision"),
  ];
  expect(latestModel("typesafe-ai/jev", catalog)?.id).toBe("typesafe-ai/jev-1.14.0");
});
