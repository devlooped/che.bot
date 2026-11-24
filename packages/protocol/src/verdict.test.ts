import { describe, expect, test } from "vitest";
import type { DraftVerdict, ModelId } from "./model.ts";
import { POINT_CHARS, SUMMARY_POINTS, summaryPoints, tldrOf } from "./summary.ts";
import { readVerdict, verdictEmoji, verdictOf } from "./verdict.ts";

const drafts = (verdicts: Partial<Record<ModelId, DraftVerdict>>) =>
  Object.entries(verdicts).map(([model, verdict]) => ({ model: model as ModelId, verdict }));
const claim = (rating: DraftVerdict["rating"]): DraftVerdict => ({ kind: "claim", rating });
const question = (rating: DraftVerdict["rating"]): DraftVerdict => ({ kind: "question", rating });
const fact: DraftVerdict = { kind: "fact", rating: null };

describe("the verdict of a draft", () => {
  test("none, or any rating of a fact, is no rating", () => {
    expect(readVerdict({ kind: "claim", rating: "depends" })).toEqual(claim("depends"));
    expect(readVerdict({ kind: "question", rating: "none" })).toEqual(question(null));
    expect(readVerdict({ kind: "fact", rating: "true" })).toEqual(fact);
  });
});

describe("the verdict of a run", () => {
  test("the rating most models gave, with each model's vote", () => {
    expect(
      verdictOf(
        drafts({
          grok: claim("true"),
          claude: claim("depends"),
          openai: claim("depends"),
          gemini: claim("unknown"),
        }),
      ),
    ).toEqual({
      kind: "claim",
      outcome: "depends",
      votes: { grok: "true", claude: "depends", openai: "depends", gemini: "unknown" },
    });
  });

  test("a tie of the top ratings is split", () => {
    expect(
      verdictOf(
        drafts({
          grok: question("true"),
          claude: question("false"),
          openai: question("true"),
          gemini: question("false"),
        }),
      )?.outcome,
    ).toBe("split");
  });

  test("the kind most drafts gave; a model that took it for a fact gave no rating", () => {
    expect(
      verdictOf(drafts({ grok: fact, claude: question("true"), openai: question("true") })),
    ).toEqual({
      kind: "question",
      outcome: "true",
      votes: { grok: null, claude: "true", openai: "true" },
    });
  });

  test("a tie of kinds goes to the first model's, in the fixed order", () => {
    expect(verdictOf(drafts({ grok: claim("false"), claude: question("false") }))?.kind).toBe(
      "claim",
    );
    expect(verdictOf(drafts({ claude: question("false"), gemini: claim("false") }))?.kind).toBe(
      "question",
    );
  });

  test("a fact has no votes", () => {
    expect(verdictOf(drafts({ grok: fact, claude: fact, openai: question("true") }))).toEqual({
      kind: "fact",
      outcome: null,
      votes: {},
    });
  });

  test("no rating at all has no outcome; no verdict at all is none", () => {
    expect(verdictOf(drafts({ grok: claim(null) }))).toEqual({
      kind: "claim",
      outcome: null,
      votes: { grok: null },
    });
    expect(verdictOf([{ model: "grok" }, { model: "claude" }])).toBeNull();
  });
});

describe("the emoji of a verdict", () => {
  test("one per rating; a claim that depends misleads, a question that depends is debated", () => {
    const emoji = (kind: DraftVerdict["kind"], outcome: "split" | DraftVerdict["rating"]) =>
      verdictEmoji({ kind, outcome });
    expect(emoji("claim", "true")).toBe("👍");
    expect(emoji("question", "false")).toBe("👎");
    expect(emoji("claim", "depends")).toBe("⚠️");
    expect(emoji("question", "depends")).toBe("🤔");
    expect(emoji("claim", "unknown")).toBe("❓");
    expect(emoji("question", "split")).toBe("⚖️");
    expect(emoji("fact", null)).toBe("📊");
    expect(emoji("claim", null)).toBeNull();
    expect(verdictEmoji(null)).toBeNull();
  });
});

describe("the summary", () => {
  const split = verdictOf(drafts({ grok: claim("true"), claude: claim("false") }));

  test("a line per point, each led by the emoji of its verdict", () => {
    const kept = tldrOf(
      [
        { kind: "claim", rating: "false", text: "  La cifra\n exagera.  " },
        { kind: "question", rating: "depends", text: "Depende del riego." },
        { kind: "fact", rating: "true", text: "Son 15.400 litros." },
        { kind: "claim", rating: "none", text: "   " },
      ],
      split,
    );
    expect(kept).toBe("👎 La cifra exagera.\n🤔 Depende del riego.\n📊 Son 15.400 litros.");
    expect(summaryPoints(kept ?? "", split)).toEqual([
      { emoji: "👎", text: "La cifra exagera." },
      { emoji: "🤔", text: "Depende del riego." },
      { emoji: "📊", text: "Son 15.400 litros." },
    ]);
  });

  test("a lone point takes the emoji of the run's verdict, the one over the picture", () => {
    const point = { kind: "claim", rating: "true", text: "Es cierto." } as const;
    expect(tldrOf([point], split)).toBe("⚖️ Es cierto.");
    expect(tldrOf([point], null)).toBe("👍 Es cierto.");
    expect(tldrOf([{ ...point, rating: "none" }], null)).toBe("Es cierto.");
  });

  test("at most SUMMARY_POINTS, each cut at a word past its length; null when nothing is left", () => {
    const point = { kind: "fact", rating: "none", text: "palabra ".repeat(80) } as const;
    const lines = (tldrOf(Array(SUMMARY_POINTS + 2).fill(point), null) ?? "").split("\n");
    expect(lines).toHaveLength(SUMMARY_POINTS);
    expect(lines[0]).toMatch(/^📊 palabra .*palabra…$/);
    expect((lines[0] ?? "").length).toBeLessThanOrEqual(POINT_CHARS + 3);
    expect(tldrOf([{ ...point, text: "   " }], null)).toBeNull();
    expect(tldrOf([], split)).toBeNull();
  });

  test("a summary written before the points is one point, with the emoji of the run's verdict", () => {
    expect(summaryPoints("Canberra es la capital.", split)).toEqual([
      { emoji: "⚖️", text: "Canberra es la capital." },
    ]);
    expect(summaryPoints("Canberra es la capital.", null)).toEqual([
      { emoji: null, text: "Canberra es la capital." },
    ]);
  });
});
