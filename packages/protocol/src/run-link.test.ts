import { expect, test } from "vitest";
import {
  base62,
  linkOf,
  parseRunRef,
  QUARANTIME_EPOCH_MS,
  quaranSeconds,
  runPath,
  runUuid,
  shortOf,
  slugOf,
} from "./run-link.ts";

test("the QuaranTime epoch is 2020-03-20 at midnight in Buenos Aires", () => {
  expect(new Date(QUARANTIME_EPOCH_MS).toISOString()).toBe("2020-03-20T03:00:00.000Z");
  expect(quaranSeconds(QUARANTIME_EPOCH_MS + 1999)).toBe(1);
});

test("Base62 counts 0-9, A-Z, then a-z", () => {
  expect(base62(0)).toBe("0");
  expect(base62(61)).toBe("z");
  expect(base62(62)).toBe("10");
  expect(base62(62 ** 5 - 1)).toBe("zzzzz");
  expect(() => base62(-1)).toThrow(RangeError);
  expect(() => base62(1.5)).toThrow(RangeError);
});

test("the short part of a link is five characters until 2049", () => {
  expect(shortOf(quaranSeconds(Date.parse("2026-11-17T20:53:03Z")))).toBe("EEIHf");
  expect(shortOf(62 ** 5 - 1)).toHaveLength(5);
});

test("a path names a run by its UUID, or by its link, whole or short", () => {
  const uuid = "0E2F7A3C-1B2D-4E5F-8A9B-0C1D2E3F4A5B";
  expect(parseRunRef(uuid)).toEqual({ kind: "uuid", id: uuid.toLowerCase() });
  expect(runUuid(uuid)).toBe(uuid.toLowerCase());
  expect(parseRunRef("EEIHf")).toEqual({ kind: "link", short: "EEIHf", words: null });
  expect(parseRunRef("EEIHf-capital-de-australia")).toEqual({
    kind: "link",
    short: "EEIHf",
    words: "capital-de-australia",
  });
  for (const bad of ["", "-algo", "EEIHf-", "EEI.Hf", "x".repeat(12)])
    expect(parseRunRef(bad), bad).toBeNull();
  expect(runUuid("EEIHf")).toBeNull();
  expect(linkOf("EEIHf", "capital-de-australia")).toBe("EEIHf-capital-de-australia");
  expect(runPath(uuid.toLowerCase())).toBe(`/r/${uuid.toLowerCase()}`);
  expect(runPath(uuid, "EEIHf-capital-de-australia")).toBe("/r/EEIHf-capital-de-australia");
});

test("the words of a link are up to five plain words: lower case, no accents, letters and digits", () => {
  expect(slugOf(["¿Cuánto", "mide", "el", "Aconcagua?", "2026", "hoy"])).toBe(
    "cuanto-mide-el-aconcagua-2026",
  );
  expect(slugOf(["Año Niño", "pingüino"])).toBe("ano-nino-pinguino");
  expect(slugOf(["Aconcagua"])).toBe("aconcagua");
  expect(slugOf(["ok", "x".repeat(40)])).toBe(`ok-${"x".repeat(24)}`);
  expect(slugOf(["¿?", " "])).toBeNull();
});
