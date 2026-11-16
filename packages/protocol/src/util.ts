import { MODELS, type ModelId } from "./model.ts";

/** A deep copy of JSON data. The run state is JSON, so this is exact. */
export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** FNV-1a, 32 bits: a stable hash for deterministic choices (no crypto, runs everywhere). */
export function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A deterministic shuffle seeded by a string (mulberry32 over Fisher-Yates). */
export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  let a = hash(seed);
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    const tmp = out[i] as T;
    out[i] = out[j] as T;
    out[j] = tmp;
  }
  return out;
}

export function modelIndex(model: ModelId): number {
  return MODELS.indexOf(model);
}

export function byModelOrder(a: ModelId, b: ModelId): number {
  return modelIndex(a) - modelIndex(b);
}

/** Orders ids like "t2" < "t10" by their number. */
export function byNumericId(a: string, b: string): number {
  return idNumber(a) - idNumber(b) || (a < b ? -1 : a > b ? 1 : 0);
}

function idNumber(id: string): number {
  const m = /(\d+)$/.exec(id);
  return m ? Number(m[1]) : 0;
}

/** Lower case, collapsed whitespace, no trailing punctuation: the code's notion of "same text". */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!?…;:,\s]+$/u, "");
}

/**
 * Whether a text is at most one sentence. A sentence ends at a line break, or at `.`, `!`, `?` or
 * `…` followed by a space and a capital letter or an opening mark. A capitalized abbreviation of up
 * to 3 letters ("Dr.", "EE.") or a dotted one ("U.S.") does not end a sentence. Heuristic by design:
 * it drops reasons that are clearly paragraphs, not borderline ones.
 */
export function isOneSentence(text: string): boolean {
  const t = text.trim();
  if (t === "") return false;
  if (/[\r\n]/.test(t)) return false;
  const boundary = /([^\s]*)[.!?…]+["'”»)]*\s+(?=[\p{Lu}¿¡"“«(])/gu;
  for (const m of t.matchAll(boundary)) {
    const word = m[1] ?? "";
    const abbreviation = /^\p{Lu}\p{L}{0,2}$/u.test(word) || /\p{L}\.\p{L}/u.test(word);
    if (!abbreviation) return false;
  }
  return true;
}

export function uniqueSorted<T>(items: Iterable<T>, compare: (a: T, b: T) => number): T[] {
  return [...new Set(items)].sort(compare);
}
