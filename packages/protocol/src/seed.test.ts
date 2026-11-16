import { describe, expect, test } from "vitest";
import { type Claim, type Draft, MODELS, type ModelId, type Paragraph } from "./model.ts";
import { seedDocument } from "./seed.ts";

const LETTER: Record<ModelId, string> = { grok: "A", claude: "B", openai: "C", gemini: "D" };
const claims: Record<string, Claim> = {};
const drafts: Draft[] = MODELS.map((model) => {
  const ids = [1, 2].map((n) => {
    const id = `${LETTER[model]}${n}`;
    claims[id] = {
      id,
      model,
      text: `${model} claim ${n}.`,
      confidence: "high",
      sources: n === 1 ? ["src2", "src10"] : [],
    };
    return id;
  });
  return { model, answer: "x", claims: ids };
});

const para = (p: unknown) => p as Paragraph;

describe("seeding the document", () => {
  test("the status is derived from support and conflicts, not chosen by the merge", () => {
    const r = seedDocument({
      drafts,
      claims,
      merge: {
        paragraphs: [
          { text: "Todos.", claims: ["A1", "B1", "C1", "D1"] },
          { text: "Tres.", claims: ["A2", "B2", "C2"] },
          { text: "Uno.", claims: ["D2"] },
        ],
        conflicts: [],
      },
    });
    expect(r.fallback).toBeNull();
    expect(r.snapshot.order).toEqual(["p1", "p2", "p3"]);
    expect(r.snapshot.order.map((id) => para(r.snapshot.blocks[id]).status)).toEqual([
      "agreed",
      "majority",
      "contested",
    ]);
    expect(para(r.snapshot.blocks.p1).support).toEqual(["grok", "claude", "openai", "gemini"]);
    expect(para(r.snapshot.blocks.p1).sources).toEqual(["src2", "src10"]);
    expect(r.nextParagraph).toBe(4);
  });

  test("a conflict makes both paragraphs contested; unknown ids are ignored", () => {
    const r = seedDocument({
      drafts,
      claims,
      merge: {
        paragraphs: [
          { text: "Todos.", claims: ["A1", "B1", "C1", "D1", "Z9"] },
          { text: "Resto.", claims: ["A2", "B2", "C2", "D2"] },
        ],
        conflicts: [
          { first: "A1", second: "D2" },
          { first: "D2", second: "A1" },
          { first: "A1", second: "Z9" },
        ],
      },
    });
    expect(r.conflicts).toEqual([{ first: "A1", second: "D2" }]);
    expect(Object.values(r.snapshot.blocks).map((b) => para(b).status)).toEqual([
      "contested",
      "contested",
    ]);
    expect(para(r.snapshot.blocks.p1).claims).toEqual(["A1", "B1", "C1", "D1"]);
  });

  test("claim coverage: claims the merge dropped are appended as their own contested paragraphs", () => {
    const r = seedDocument({
      drafts,
      claims,
      merge: {
        paragraphs: [{ text: "Casi todos.", claims: ["A1", "B1", "C1", "D1", "A2", "B2"] }],
        conflicts: [],
      },
    });
    expect(r.fallback).toBe("dropped_claims");
    expect(r.snapshot.order).toEqual(["p1", "p2", "p3"]);
    expect(para(r.snapshot.blocks.p2)).toMatchObject({
      text: "openai claim 2.",
      claims: ["C2"],
      status: "contested",
    });
    const carried = Object.values(r.snapshot.blocks).flatMap((b) => para(b).claims);
    expect(new Set(carried)).toEqual(new Set(Object.keys(claims)));
  });

  test("no usable merge: the document is built from the claims, identical ones sharing a paragraph", () => {
    const same = { ...claims, B2: { ...(claims.B2 as Claim), text: "GROK CLAIM 2" } };
    const r = seedDocument({
      drafts,
      claims: same,
      merge: { paragraphs: [{ text: "  ", claims: [] }], conflicts: [] },
    });
    expect(r.fallback).toBe("no_merge");
    expect(r.snapshot.order).toHaveLength(7);
    expect(para(r.snapshot.blocks.p2)).toMatchObject({
      claims: ["A2", "B2"],
      support: ["grok", "claude"],
    });
    expect(seedDocument({ drafts, claims, merge: null }).fallback).toBe("no_merge");
  });
});
