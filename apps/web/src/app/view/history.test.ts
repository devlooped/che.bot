import { emptyView, type RunView, type Snapshot } from "@chebot/protocol";
import { describe, expect, it } from "vitest";
import { t } from "../i18n/index.ts";
import { compareWords, historyOf } from "./history.ts";

const snapshot = (version: number, paragraphs: [string, string][]): Snapshot => ({
  version,
  order: paragraphs.map(([id]) => id),
  blocks: Object.fromEntries(
    paragraphs.map(([id, text]) => [
      id,
      { kind: "paragraph", id, text, status: "agreed", support: [], claims: [], sources: [] },
    ]),
  ) as Snapshot["blocks"],
});

describe("compareWords", () => {
  it("keeps the shared words and marks what entered and what left", () => {
    expect(compareWords("unos 550 litros por kilo", "unos 600 litros por kilo")).toEqual([
      { kind: "same", text: "unos " },
      { kind: "removed", text: "550 " },
      { kind: "added", text: "600 " },
      { kind: "same", text: "litros por kilo" },
    ]);
  });

  it("keeps a change of several words in one piece", () => {
    const rest = "la cifra de 15.400 litros exagera el impacto.";
    expect(compareWords(`Por eso ${rest}`, `Hay quienes dicen que ${rest}`)).toEqual([
      { kind: "removed", text: "Por eso " },
      { kind: "added", text: "Hay quienes dicen que " },
      { kind: "same", text: rest },
    ]);
  });

  it("shows a paragraph rewritten more than half as a whole replacement", () => {
    expect(
      compareWords("Por eso exagera: no se gasta.", "Hay quienes dicen que exagera el impacto."),
    ).toEqual([
      { kind: "removed", text: "Por eso exagera: no se gasta. " },
      { kind: "added", text: "Hay quienes dicen que exagera el impacto." },
    ]);
  });

  it("gives the text back when the pieces that did not leave are joined", () => {
    const after = "La cifra que más se cita es de unos 15.400 litros.";
    const pieces = compareWords("La cifra más citada es de unos 15.400 litros.", after);
    expect(
      pieces
        .filter((p) => p.kind !== "removed")
        .map((p) => p.text)
        .join(""),
    ).toBe(after);
  });
});

describe("historyOf", () => {
  const view: RunView = {
    ...emptyView(),
    status: "completed",
    drafts: [
      { model: "grok", answer: "", claims: [] },
      { model: "claude", answer: "", claims: [] },
      { model: "openai", answer: "", claims: [] },
    ],
    snapshots: [
      snapshot(1, [
        ["p1", "Uno dos tres."],
        ["p2", "Cuatro."],
      ]),
      snapshot(2, [
        ["p1", "Uno dos tres."],
        ["p3", "Nuevo."],
      ]),
      snapshot(3, [
        ["p1", "Uno, dos y tres."],
        ["p3", "Nuevo."],
      ]),
    ],
    versions: [
      { version: 1, cause: "merge", threads: [], round: null },
      { version: 2, cause: "round", threads: ["t1"], round: 2 },
      { version: 3, cause: "edit", threads: [], round: null },
    ],
    threads: {
      t1: {
        id: "t1",
        lockKey: "p2",
        block: "p2",
        openedRound: 1,
        alternatives: ["s1"],
        state: "accepted",
        winner: "s1",
      },
    },
    suggestions: {
      s1: {
        id: "s1",
        thread: "t1",
        author: "claude",
        coAuthors: [],
        round: 1,
        target: { block: "p2" },
        op: "replace",
        kind: "wrong",
        text: "Nuevo.",
        reason: "",
        sources: [],
      },
    } as unknown as RunView["suggestions"],
  };

  it("names each step in plain words and says what it did", () => {
    const steps = historyOf(view);
    expect(steps.map((s) => s.label)).toEqual([
      t.history.steps.merge,
      t.history.steps.round(2),
      t.history.steps.edit,
    ]);
    expect(steps.map((s) => s.what)).toEqual([
      t.history.what.merge(3),
      t.history.what.round("Claude", 1),
      t.history.what.edit,
    ]);
  });

  it("compares each version with the one before, and keeps what left where it was", () => {
    const [first, second, third] = historyOf(view);
    expect(first?.paragraphs.map((p) => p.change)).toEqual(["same", "same"]);
    expect(second?.paragraphs.map((p) => [p.id, p.change, p.by])).toEqual([
      ["p1", "same", null],
      ["p2", "removed", "claude"],
      ["p3", "added", null],
    ]);
    expect(third?.paragraphs[0]?.change).toBe("changed");
    expect(third?.paragraphs[0]?.pieces.some((p) => p.kind === "added")).toBe(true);
  });
});
