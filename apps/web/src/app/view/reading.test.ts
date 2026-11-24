import { describe, expect, it } from "vitest";
import { DWELL_MS, HOLD_MS, paragraphsOf, Reader, readable, WORDS_PER_SECOND } from "./reading.ts";

const WORD_MS = 1_000 / WORDS_PER_SECOND;

describe("readable", () => {
  it("leaves URLs, links' addresses, Markdown marks and list marks out", () => {
    expect(
      readable(
        "- Según el [IGN](https://www.ign.gob.ar/x) mide **6.960,8 m** (https://a.example/b), `ok`.",
      ),
    ).toBe("Según el IGN mide 6.960,8 m, ok.");
    expect(readable("Fuente: [IGN](https://www.ign")).toBe("Fuente: IGN");
    expect(readable("Fuente: [IGN")).toBe("Fuente: IGN");
    expect(readable("Ver www.ign.gob.ar para más.")).toBe("Ver para más.");
  });

  it("drops a heading alone, JSON and code", () => {
    expect(readable("**Weighing the sources**")).toBe("");
    expect(readable("**Weighing the sou")).toBe("");
    expect(readable("## Plan")).toBe("");
    expect(readable('{"answer": "Mide 6.960,8 m."}')).toBe("");
    expect(readable("```json\nconst a = 1;\n```")).toBe("");
    expect(readable("Así:\n```\nconst a = 1;\n```\nY listo.")).toBe("Así: Y listo.");
    expect(readable("Primero esto:\n{\n}\nY después aquello.")).toBe(
      "Primero esto: Y después aquello.",
    );
    expect(readable("**Cifra**: 6.960,8 m.")).toBe("Cifra: 6.960,8 m.");
  });

  it("keeps the place of a paragraph with nothing to read", () => {
    expect(paragraphsOf("**Plan**\n\nBusco la cifra.\n\n```\n\nLa tengo.")).toEqual([
      [],
      ["Busco", "la", "cifra."],
      [],
      ["La", "tengo."],
    ]);
  });
});

describe("the reader", () => {
  const text = (reader: Reader, now: number) => reader.at(now)?.text;

  it("shows a word at a time at the pace of reading, whatever the pace of the stream", () => {
    const reader = new Reader();
    expect(reader.at(0)).toBeNull();
    reader.feed("**Plan**\n\nUno dos tres cuatro cinco seis.");
    expect(text(reader, 0)).toBe("Uno");
    expect(text(reader, WORD_MS * 2)).toBe("Uno dos tres");
    expect(text(reader, WORD_MS * 10)).toBe("Uno dos tres cuatro cinco seis.");
  });

  it("waits for a paragraph still being written, then goes on reading it", () => {
    const reader = new Reader();
    reader.feed("Uno dos");
    expect(text(reader, 0)).toBe("Uno");
    expect(text(reader, WORD_MS * 5)).toBe("Uno dos");
    reader.feed("Uno dos tres cuatro");
    expect(text(reader, WORD_MS * 5 + 10)).toBe("Uno dos tres");
    expect(text(reader, WORD_MS * 7)).toBe("Uno dos tres cuatro");
  });

  it("holds a paragraph read to its end, then goes to the next", () => {
    const reader = new Reader();
    reader.feed("Uno dos.");
    expect(reader.at(0)).toEqual({ paragraph: 0, text: "Uno" });
    reader.feed("Uno dos.\n\nTres cuatro.");
    reader.at(WORD_MS);
    expect(reader.at(WORD_MS + HOLD_MS - 1)).toEqual({ paragraph: 0, text: "Uno dos." });
    expect(reader.at(WORD_MS + HOLD_MS)).toEqual({ paragraph: 1, text: "Tres" });
  });

  it("skips to the newest paragraph when the stream runs ahead of the reading", () => {
    const reader = new Reader();
    const long = Array.from({ length: 60 }, (_, i) => `p${i}`).join(" ");
    reader.feed(long);
    reader.at(0);
    reader.feed(`${long}\n\nDos.\n\nTres está llegando`);
    // two paragraphs wait, but the first one has not shown for long enough
    expect(reader.at(DWELL_MS - 1)?.paragraph).toBe(0);
    expect(reader.at(DWELL_MS)).toEqual({ paragraph: 2, text: "Tres" });
  });

  it("starts at the newest paragraph when it opens late", () => {
    const reader = new Reader();
    reader.feed("Uno.\n\nDos.\n\nTres.");
    expect(reader.at(0)).toEqual({ paragraph: 2, text: "Tres." });
  });
});
