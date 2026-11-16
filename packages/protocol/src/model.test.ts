import { expect, test } from "vitest";
import { MODELS } from "./index.ts";

test("MODELS keeps the fixed tie-break order", () => {
  expect(MODELS).toEqual(["grok", "claude", "openai", "gemini"]);
});
