// Test support: a FakeProvider script that takes a run through every stage, the run of the
// protocol's own scripted test, read from the prompts as a model would (claim ids from the merge
// prompt, pair ids from the dedupe prompt). Thread and suggestion ids follow from the order.
import type { ModelId } from "@chebot/protocol";
import {
  type CatalogModel,
  type FakeOutcome,
  type FakeScript,
  type GenerateRequest,
  MODEL_ROLES,
} from "@chebot/providers";

export const catalogEntry = (id: string, type = "language"): CatalogModel => ({
  id,
  name: id,
  type,
  tags: [],
  efforts: [],
});

export const CATALOG: CatalogModel[] = MODEL_ROLES.map((r) => catalogEntry(r.defaultId, r.kind));

const DRAFTS: Record<ModelId, { text: string; sources: string[] }[]> = {
  grok: [
    { text: "La capital de Australia es Canberra.", sources: ["https://example.org/canberra"] },
    { text: "Canberra tiene unos 460.000 habitantes.", sources: ["https://typed.example/nope"] },
  ],
  claude: [
    { text: "Canberra es la capital australiana.", sources: [] },
    { text: "En Canberra viven alrededor de 460.000 personas.", sources: [] },
  ],
  openai: [
    {
      text: "Canberra es la capital de Australia.",
      sources: ["https://www.example.org/canberra/"],
    },
    { text: "Su población ronda las 460.000 personas.", sources: [] },
  ],
  gemini: [
    { text: "La capital de Australia es Sídney.", sources: [] },
    { text: "Canberra tiene cerca de 460.000 habitantes.", sources: ["https://example.org/abs"] },
  ],
};

const FOUND: Record<ModelId, { url: string; title: string; quote: string }[]> = {
  grok: [{ url: "https://example.org/canberra", title: "Canberra", quote: "the capital" }],
  claude: [],
  openai: [{ url: "https://example.org/canberra", title: "Canberra", quote: "the capital" }],
  gemini: [{ url: "https://example.org/abs", title: "ABS", quote: "456,000 people" }],
};

const s = (paragraph: string, op: string, text: string, reason: string, kind = "wrong") => ({
  paragraph,
  op,
  kind,
  text,
  reason,
  sources: [] as string[],
});

const ROUND1: Record<ModelId, unknown[]> = {
  grok: [
    s("p2", "delete", "", "Sídney no es la capital."),
    s("p3", "replace", "En Canberra viven unas 500.000 personas.", "La cifra está desactualizada."),
  ],
  claude: [s("p2", "delete", "", "Es un error conocido.")],
  openai: [
    s(
      "p1",
      "replace",
      "Canberra es la capital de Australia, no Sídney.",
      "Conviene descartar el error común.",
    ),
  ],
  gemini: [
    s("p1", "replace", "La capital es Canberra y no Sídney.", "Falta aclarar el error común."),
    s(
      "p3",
      "insert_after",
      "Canberra fue elegida capital en 1908.",
      "Falta el origen de la capital.",
      "missing",
    ),
  ],
};

const vote = (thread: string, choice: string, reason = "") => ({ thread, choice, reason });

const ROUND2: Record<ModelId, { votes: unknown[]; suggestions: unknown[] }> = {
  grok: { votes: [vote("t3", "s3"), vote("t4", "keep")], suggestions: [] },
  claude: {
    votes: [vote("t2", "keep"), vote("t3", "keep"), vote("t4", "s4")],
    suggestions: [
      s(
        "p3",
        "replace",
        "En Canberra viven unas 460.000 personas, según el censo de 2021.",
        "Falta la fecha de la cifra.",
      ),
    ],
  },
  openai: {
    votes: [vote("t1", "s1"), vote("t2", "keep"), vote("t4", "keep")],
    suggestions: [
      {
        ...s(
          "p1",
          "insert_after",
          "Es la ciudad más grande del interior del país.",
          "Falta un dato de contexto.",
          "missing",
        ),
        sources: ["src1"],
      },
    ],
  },
  gemini: { votes: [vote("t1", "keep"), vote("t2", "keep")], suggestions: [] },
};

const ROUND3: Record<ModelId, unknown[]> = {
  grok: [vote("t2", "s5", "La fecha del censo es mejor que mi cifra."), vote("t5", "s6")],
  claude: [vote("t5", "s6")],
  openai: [vote("t2", "s5", "El censo de 2021 respalda la cifra."), vote("t4", "s4")],
  gemini: [vote("t2", "keep"), vote("t5", "keep")],
};

/** The claim ids of the merge prompt, by their text. */
function claimIds(prompt: string): { id: string; text: string }[] {
  return [...prompt.matchAll(/^- (\w+) \[\w+\] (.*)$/gm)].map((m) => ({
    id: m[1] ?? "",
    text: m[2] ?? "",
  }));
}

export function respond(req: GenerateRequest<unknown>): FakeOutcome {
  const [kind, n, seat] = req.callKey.split(":") as [string, string, ModelId];
  const out = (output: unknown, extra: Partial<Extract<FakeOutcome, { output: unknown }>> = {}) =>
    ({
      output,
      usage: { inputTokens: 100, outputTokens: 50 },
      costUsd: seat && kind !== "moments" && kind !== "dedupe" ? 0.02 : 0.001,
      ...extra,
    }) as FakeOutcome;
  switch (kind) {
    case "draft":
      return out(
        {
          answer: DRAFTS[seat].map((c) => c.text).join("\n\n"),
          claims: DRAFTS[seat].map((c) => ({ ...c, confidence: "high" })),
        },
        { sources: FOUND[seat], costUsd: 0.05 },
      );
    case "merge": {
      const claims = claimIds(req.prompt);
      const sydney = claims.filter((c) => c.text.includes("Sídney"));
      const capital = claims.filter((c) => c.id.endsWith("1") && !c.text.includes("Sídney"));
      return out({
        paragraphs: [
          { text: "La capital de Australia es Canberra.", claims: capital.map((c) => c.id) },
          { text: "Algunos dicen que es Sídney.", claims: sydney.map((c) => c.id) },
          {
            text: "En Canberra viven unas 460.000 personas.",
            claims: claims.filter((c) => c.id.endsWith("2")).map((c) => c.id),
          },
        ],
        conflicts: sydney[0] && capital[0] ? [{ first: capital[0].id, second: sydney[0].id }] : [],
      });
    }
    case "round":
      if (n === "1") return out({ suggestions: ROUND1[seat] });
      if (n === "2") return out(ROUND2[seat]);
      return out({ votes: ROUND3[seat] });
    case "dedupe": {
      const pairs = [...req.prompt.matchAll(/^## (\S+)$/gm)].map((m) => m[1] ?? "");
      return out({
        pairs: pairs.map((pair) => ({ pair, verdict: n === "1" ? "same" : "different" })),
      });
    }
    case "edit":
      return out({
        paragraphs: [
          { id: "p1", text: "Canberra, y no Sídney, es la capital de Australia." },
          { id: "p3", text: "En Canberra viven unas 470.000 personas." },
        ],
      });
    case "edit-check":
      return out({
        checks: [
          { id: "p1", verdict: "same" },
          { id: "p3", verdict: "changed" },
        ],
      });
    case "moments":
      return out({ sentences: ["Los cuatro están trabajando."] });
    default:
      return { kind: "error", message: `unscripted ${req.callKey}` };
  }
}

export function script(overrides: FakeScript["calls"] = {}): FakeScript {
  return { calls: overrides, respond };
}
