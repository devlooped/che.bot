import { expect, test } from "vitest";
import type { CatalogModel } from "./catalog.ts";
import { type ModelSetting, resolveModels } from "./resolve.ts";
import { MODEL_ROLES } from "./roles.ts";

const entry = (id: string, type = "language"): CatalogModel => ({
  id,
  name: id,
  type,
  tags: [],
  efforts: [],
});
const defaults: CatalogModel[] = MODEL_ROLES.map((role) => entry(role.defaultId, role.kind));

test("without settings every role resolves to its default, with its default effort", () => {
  expect(resolveModels([], defaults)).toEqual({
    "panel.grok": { id: "spacexai/grok-4.7", effort: "low" },
    "panel.claude": { id: "anthropic/claude-opus-5.5", effort: "medium" },
    "panel.openai": { id: "openai/gpt-6.1-sol", effort: "medium" },
    "panel.gemini": { id: "google/gemini-4-argon", effort: "medium" },
    utility: { id: "anthropic/claude-haiku-5.5", effort: null },
    classifier: { id: "typesafe-ai/jev", effort: null },
    helper: { id: "anthropic/claude-haiku-5.5", effort: "medium" },
    image: { id: "spacexai/grok-imagine-image-2.0", effort: null },
  });
});

test("an image role resolves from the image models only, without effort", () => {
  const catalog = [
    ...defaults,
    entry("spacexai/grok-imagine-image-2.1", "image"),
    entry("spacexai/grok-imagine-image-3.0"), // a language model of the same family is not one
  ];
  const snapshot = resolveModels(
    [{ role: "image", modelId: "spacexai/grok-imagine-image", effort: "high" }],
    catalog,
  );
  expect(snapshot.image).toEqual({ id: "spacexai/grok-imagine-image-2.1", effort: null });
});

test("a setting with an old version resolves to the newest model of its family", () => {
  const settings: ModelSetting[] = [
    { role: "panel.claude", modelId: "anthropic/claude-opus-4.7", effort: "high" },
    { role: "utility", modelId: "deepseek/deepseek-v4-flash", effort: null },
    { role: "retired.role", modelId: "x/y-1", effort: null },
  ];
  const catalog = [
    ...defaults,
    entry("anthropic/claude-opus-5.5-fast"),
    entry("deepseek/deepseek-v4.1-flash"),
    entry("deepseek/deepseek-v9-pro"),
  ];
  const snapshot = resolveModels(settings, catalog);
  expect(snapshot["panel.claude"]).toEqual({ id: "anthropic/claude-opus-5.5", effort: "high" });
  expect(snapshot.utility).toEqual({ id: "deepseek/deepseek-v4.1-flash", effort: null });
  // A newer default version is picked up without a change of settings.
  expect(resolveModels([], [...catalog, entry("spacexai/grok-4.8")])["panel.grok"].id).toBe(
    "spacexai/grok-4.8",
  );
});

test("a snapshot taken before a settings change is unaffected by it", () => {
  const settings: ModelSetting[] = [
    { role: "panel.openai", modelId: "openai/gpt-sol", effort: "low" },
  ];
  const snapshot = resolveModels(settings, defaults);
  const stored = structuredClone(snapshot);
  settings[0] = { role: "panel.openai", modelId: "openai/gpt-6.1-terra", effort: "high" };
  const next = resolveModels(settings, [...defaults, entry("openai/gpt-6.1-terra")]);
  expect(next["panel.openai"]).toEqual({ id: "openai/gpt-6.1-terra", effort: "high" });
  expect(snapshot).toEqual(stored);
  expect(snapshot["panel.openai"]).toEqual({ id: "openai/gpt-6.1-sol", effort: "low" });
});

test("a role of kind decision resolves from the decision models only, without effort", () => {
  const catalog = [
    ...defaults.filter((model) => model.type !== "decision"),
    entry("typesafe-ai/jev"),
    entry("typesafe-ai/jev-9.0.0"), // a language model of the same family is not a candidate
    entry("typesafe-ai/jev", "decision"),
    entry("typesafe-ai/jev-1.14.0", "decision"),
  ];
  const snapshot = resolveModels(
    [{ role: "classifier", modelId: "typesafe-ai/jev", effort: "high" }],
    catalog,
  );
  expect(snapshot.classifier).toEqual({ id: "typesafe-ai/jev-1.14.0", effort: null });
});

test("a family missing from the catalog, or only of another kind, fails", () => {
  expect(() =>
    resolveModels(
      [{ role: "utility", modelId: "deepseek/deepseek-flash", effort: null }],
      defaults,
    ),
  ).toThrow(/deepseek\/deepseek-flash/);
  expect(() =>
    resolveModels(
      [],
      defaults.filter((model) => model.type !== "decision"),
    ),
  ).toThrow(/decision model of the family typesafe-ai\/jev/);
});
