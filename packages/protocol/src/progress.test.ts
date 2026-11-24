import { expect, test } from "vitest";
import { isProgressMessage } from "./index.ts";

test("a progress message names a seat of the panel, its call, and more text or null", () => {
  const message = { type: "seat.progress", call: "draft:0:grok" };
  expect(isProgressMessage({ ...message, seat: "grok", text: "Busco." })).toBe(true);
  expect(isProgressMessage({ ...message, seat: "claude", text: null })).toBe(true);
  expect(isProgressMessage({ ...message, seat: "utility", text: "x" })).toBe(false);
  expect(isProgressMessage({ type: "seat.progress", seat: "grok", text: "x" })).toBe(false);
  expect(isProgressMessage({ type: "moment", seq: 3 })).toBe(false);
  expect(isProgressMessage(null)).toBe(false);
});
