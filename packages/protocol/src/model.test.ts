import { expect, test } from "vitest";
import { MODELS, MODELS_BY_NAME } from "./index.ts";

test("MODELS keeps the fixed tie-break order", () => {
  expect(MODELS).toEqual(["grok", "claude", "openai", "gemini"]);
});

test("MODELS_BY_NAME lists the models alphabetically by display name", () => {
  expect(MODELS_BY_NAME).toEqual(["openai", "claude", "gemini", "grok"]);
});
