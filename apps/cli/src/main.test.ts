import { expect, test } from "vitest";
import { run } from "./main.ts";

test("eval is not implemented yet (exit 1)", async () => {
  expect((await run(["eval"])).code).toBe(1);
});

test("ask without a question, or with a bad option, prints its usage (exit 2)", async () => {
  const result = await run(["ask"]);
  expect(result.code).toBe(2);
  expect(result.message).toContain("--max-usd");
  expect((await run(["ask", "hola", "--mode", "slow"])).code).toBe(2);
});

test("anything else prints usage (exit 2)", async () => {
  const result = await run(["nope"]);
  expect(result.code).toBe(2);
  expect(result.message).toContain("Usage");
  expect((await run([])).code).toBe(2);
});
