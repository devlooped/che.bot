import { Experimental_DecisionMockModelV4 } from "ai/test";
import { expect, test } from "vitest";
import { classify, classOf } from "./classify.ts";
import { ProviderError } from "./provider.ts";

type Answer = Awaited<ReturnType<Experimental_DecisionMockModelV4["doDecide"]>>["answers"][string];

const mock = (answer: Answer, cost = "0.00001") =>
  new Experimental_DecisionMockModelV4({
    doDecide: async () => ({
      answers: { complexity: answer },
      usage: { inputTokens: 30, outputTokens: 0 },
      warnings: [],
      providerMetadata: { gateway: { cost } },
    }),
  });

const run = (answer: Answer) =>
  classify(
    {
      question: "¿Cuál es la capital de Francia?",
      model: { id: "typesafe-ai/jev", effort: null },
      signal: new AbortController().signal,
    },
    { decisionModel: () => mock(answer) },
  );

test("the 0.7 rule: simple only when chosen with a probability of at least 0.7", () => {
  expect(classOf("simple", 0.95)).toBe("simple");
  expect(classOf("simple", 0.7)).toBe("simple");
  expect(classOf("simple", 0.69)).toBe("complex");
  expect(classOf("simple", null)).toBe("complex");
  expect(classOf("complex", 0.55)).toBe("complex");
  expect(classOf("complex", 0.99)).toBe("complex");
});

test("returns the choice, its probability, the class, the usage and the cost", async () => {
  const sure = await run({
    type: "choice",
    choice: "simple",
    probabilities: { simple: 0.9, complex: 0.1 },
  });
  expect(sure).toMatchObject({
    class: "simple",
    choice: "simple",
    probability: 0.9,
    usage: { inputTokens: 30, outputTokens: 0 },
  });
  expect(sure.costUsd).toBeCloseTo(0.00001);

  const unsure = await run({
    type: "choice",
    choice: "simple",
    probabilities: { simple: 0.6, complex: 0.4 },
  });
  expect(unsure).toMatchObject({ class: "complex", choice: "simple", probability: 0.6 });

  const noDistribution = await run({ type: "choice", choice: "simple" });
  expect(noDistribution).toMatchObject({ class: "complex", probability: null });
});

test("a refused question is a ProviderError of kind refusal", async () => {
  const error = await run({ type: "refusal" }).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ProviderError);
  expect((error as ProviderError).kind).toBe("refusal");
});
