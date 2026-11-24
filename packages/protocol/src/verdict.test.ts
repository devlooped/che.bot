import { describe, expect, test } from "vitest";
import type { DraftVerdict, ModelId } from "./model.ts";
import { TLDR_CHARS, tldrOf } from "./prompts/utility.ts";
import { readVerdict, verdictOf } from "./verdict.ts";

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

describe("the TL;DR", () => {
  test("one line, cut at a word past its length", () => {
    expect(tldrOf("  Canberra,\n la capital.  ")).toBe("Canberra, la capital.");
    expect(tldrOf("   ")).toBeNull();
    const long = tldrOf("palabra ".repeat(80)) ?? "";
    expect(long.length).toBeLessThanOrEqual(TLDR_CHARS);
    expect(long).toMatch(/palabra…$/);
  });
});
