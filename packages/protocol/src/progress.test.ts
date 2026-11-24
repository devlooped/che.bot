import { expect, test } from "vitest";
import { isProgressMessage, progressTail } from "./index.ts";

test("the tail is the last paragraph, plain", () => {
  expect(
    progressTail("Busco la cifra.\n\n**Comparando fuentes**\n\nLa de la FAO   dice\n15.400."),
  ).toBe("La de la FAO dice 15.400.");
  expect(progressTail("## Plan\n\nUno `dos`\n\n  \n")).toBe("Uno dos");
  expect(progressTail("")).toBe("");
});

test("a long paragraph keeps its end, from the start of a word, after an ellipsis", () => {
  expect(progressTail("uno dos tres cuatro cinco", 12)).toBe("…cuatro cinco");
  expect(progressTail("uno dos tres cuatro cinco", 10)).toBe("…cinco");
  expect(progressTail("abcdefghij", 4)).toBe("…ghij");
});

test("a progress message names a seat of the panel and a text or null", () => {
  expect(isProgressMessage({ type: "seat.progress", seat: "grok", text: "Busco." })).toBe(true);
  expect(isProgressMessage({ type: "seat.progress", seat: "claude", text: null })).toBe(true);
  expect(isProgressMessage({ type: "seat.progress", seat: "utility", text: "x" })).toBe(false);
  expect(isProgressMessage({ type: "moment", seq: 3 })).toBe(false);
  expect(isProgressMessage(null)).toBe(false);
});
