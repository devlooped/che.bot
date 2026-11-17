// The public link of a run. A run is a UUID inside (its object, its payment job, its row); once the
// helper model named the question, its link is /r/<short>-<words>: the second it was asked, in
// seconds since the QuaranTime epoch in Base62 (five characters until 2049), and up to five words
// that sum the question up, the question's own or the helper's. The link is claimed whole, so two questions of the same second rarely meet; the
// UUID link and the short one alone redirect to it for good.

/** The QuaranTime epoch: the start of Argentina's quarantine, 2020-03-20 00:00 at GMT-03:00. */
export const QUARANTIME_EPOCH_MS = Date.UTC(2020, 2, 20, 3);

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** A non-negative safe integer in Base62 (0-9, A-Z, a-z: case matters). */
export function base62(n: number): string {
  if (!Number.isSafeInteger(n) || n < 0) throw new RangeError(`Not a non-negative integer: ${n}`);
  let out = "";
  do {
    out = BASE62.charAt(n % 62) + out;
    n = Math.floor(n / 62);
  } while (n > 0);
  return out;
}

/** The seconds since the QuaranTime epoch at `ms`. */
export const quaranSeconds = (ms: number) => Math.floor((ms - QUARANTIME_EPOCH_MS) / 1000);

/** The short part of a link: the second of the QuaranTime epoch, in Base62. */
export const shortOf = (seconds: number) => base62(seconds);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHORT = /^[0-9A-Za-z]{1,11}$/;

/** The UUID of a run in lower case, or null when `id` is none. */
export function runUuid(id: string): string | null {
  return UUID.test(id) ? id.toLowerCase() : null;
}

/**
 * What the last segment of a run's path names: the UUID of the run, or a link, whole ("EEIHf-
 * capital-de-australia-...") or short ("EEIHf"). Null for anything else.
 */
export type RunRef =
  | { kind: "uuid"; id: string }
  | { kind: "link"; short: string; words: string | null };

export function parseRunRef(ref: string): RunRef | null {
  const id = runUuid(ref);
  if (id) return { kind: "uuid", id };
  const at = ref.indexOf("-");
  const short = at < 0 ? ref : ref.slice(0, at);
  const words = at < 0 ? null : ref.slice(at + 1);
  if (!SHORT.test(short) || words === "") return null;
  return { kind: "link", short, words };
}

/** The path of a run's page: its link once it has one, its UUID before. */
export const runPath = (id: string, link?: string | null) => `/r/${link ?? id}`;

/** The link of a run from its short part and its words. */
export const linkOf = (short: string, words: string) => `${short}-${words}`;

/** The words of a link, at most. */
export const SLUG_WORDS = 5;
const MAX_WORD_CHARS = 24;

/**
 * The words of a link from those the helper model chose: lower case, without accents, letters and
 * digits only, at most SLUG_WORDS words joined by "-". Null when nothing is left.
 */
export function slugOf(words: readonly string[]): string | null {
  const clean = words
    .flatMap((word) =>
      word
        .normalize("NFKD")
        .replace(/\p{M}/gu, "")
        .toLowerCase()
        .split(/[^a-z0-9]+/),
    )
    .map((word) => word.slice(0, MAX_WORD_CHARS))
    .filter(Boolean)
    .slice(0, SLUG_WORDS);
  return clean.length ? clean.join("-") : null;
}
