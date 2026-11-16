// Live test of the classifier against Vercel AI Gateway: skipped without AI_GATEWAY_API_KEY.
import { describe, expect, test } from "vitest";
import { fetchGatewayCatalog } from "./catalog.ts";
import { classify } from "./classify.ts";
import { resolveModels } from "./resolve.ts";

const live = Boolean(process.env.AI_GATEWAY_API_KEY);

describe.skipIf(!live)("classifier live", () => {
  test("classes a definition as simple and a disputed question as complex", {
    timeout: 120_000,
  }, async () => {
    const { classifier } = resolveModels([], await fetchGatewayCatalog());
    const ask = (question: string) =>
      classify({ question, model: classifier, signal: AbortSignal.timeout(60_000) });
    const [simple, complex] = await Promise.all([
      ask("¿Cuál es la capital de Francia?"),
      ask(
        "¿Conviene más alquilar o comprar una vivienda en Buenos Aires en 2026, considerando inflación, crédito hipotecario y rentabilidad?",
      ),
    ]);
    console.table([
      { model: classifier.id, question: "capital", ...simple },
      { model: classifier.id, question: "alquilar o comprar", ...complex },
    ]);
    expect(simple.choice).toBe("simple");
    expect(complex.class).toBe("complex");
    expect(simple.probability).not.toBeNull();
  });
});
