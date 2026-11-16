import { expect, test } from "vitest";
import { run } from "./main.ts";

test("ask and eval are not implemented yet (exit 1)", () => {
  expect(run(["ask", "hola"]).code).toBe(1);
  expect(run(["eval"]).code).toBe(1);
});

test("anything else prints usage (exit 2)", () => {
  const result = run(["nope"]);
  expect(result.code).toBe(2);
  expect(result.message).toContain("Usage");
  expect(run([]).code).toBe(2);
});
