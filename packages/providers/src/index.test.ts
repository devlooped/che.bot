import { MODELS } from "@chebot/protocol";
import { expect, test } from "vitest";

test("the workspace link to @chebot/protocol resolves", () => {
  expect(MODELS).toHaveLength(4);
});
