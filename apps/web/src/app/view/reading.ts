// What a seat is thinking, read at the pace of a reader instead of the pace of the stream: the
// text of a call is cut into its paragraphs, each made plain (no URLs, JSON, code or Markdown, no
// heading alone), and shown a word at a time. A reader who falls behind the stream skips to its
// newest paragraph: what shows is something to read, never all of it.

/** About 240 words a minute: a normal pace of reading. */
export const WORDS_PER_SECOND = 4;
/** A paragraph read to its end stays this long before the next one replaces it. */
export const HOLD_MS = 1_500;
/** A paragraph shows at least this long before it is left unfinished for a newer one. */
export const DWELL_MS = 5_000;

/** A heading alone (`**Weighing the sources**`, `## Plan`), still being written or not. */
const HEADING = /^(?:\*\*[^*\n]*(?:\*\*)?|__[^_\n]*(?:__)?|#{1,6}\s[^\n]*)$/;
/** A key of JSON, as in `"answer": …`. */
const JSON_KEY = /"[\w-]+"\s*:/;
/** A fence of code. */
const FENCE = /^\s*```/;
/** A line of JSON that opens or closes an object or a list. */
const BRACKET = /^\s*[{}[\]]/;

/** The lines of a paragraph that are not code or JSON: no fence, nothing inside one. */
function proseLines(paragraph: string): string[] {
  let code = false;
  return paragraph.split("\n").filter((line) => {
    if (FENCE.test(line)) {
      code = !code;
      return false;
    }
    return !code && !BRACKET.test(line);
  });
}

/** A paragraph as plain text to read; empty when nothing of it is worth reading. */
export function readable(paragraph: string): string {
  const trimmed = paragraph.trim();
  if (!trimmed || HEADING.test(trimmed) || JSON_KEY.test(trimmed)) return "";
  return (
    proseLines(trimmed)
      // the marks of a heading, a quote or an item of a list
      .map((line) => line.replace(/^\s*(?:#{1,6}|>|[-*+•]|\d+[.)])\s+/, ""))
      .join(" ")
      // a link, even one still being written, reads as its text
      .replace(/\[([^\]]*)\](?:\([^)]*\)?)?/g, "$1")
      .replace(/\[([^\]]*)$/, "$1")
      .replace(/(?:https?:\/\/|www\.)[^\s)\]]*/g, "")
      .replace(/\*+|`+|_{2,}/g, "")
      // what the URLs leave: empty parentheses, a space before a comma
      .replace(/\(\s*[,;:]?\s*\)/g, "")
      .replace(/\s+([,.;:!?)])/g, "$1")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/** The paragraphs of what a call said, each readable (an empty one is skipped, not removed). */
export function paragraphsOf(text: string): string[][] {
  return text.split(/\n\s*\n/).map((paragraph) => readable(paragraph).split(" ").filter(Boolean));
}

/** What shows: the words read so far of a paragraph, and which paragraph (a new one fades in). */
export interface Reading {
  paragraph: number;
  text: string;
}

/**
 * Reads what a call says as it streams (`feed`), a word at a time at WORDS_PER_SECOND (`at`). A
 * paragraph read to its end gives way to the next after HOLD_MS; when two paragraphs or more wait
 * behind it, to the newest instead, and a paragraph shown for DWELL_MS is left unfinished for it.
 */
export class Reader {
  private paragraphs: string[][] = [];
  private current = -1;
  /** Words read of the current paragraph (fractions accumulate between two calls of `at`). */
  private read = 0;
  private started = 0;
  /** When the current paragraph was read to its end; null while it is not. */
  private finished: number | null = null;
  private last: number | null = null;

  /** Everything the call said so far. */
  feed(text: string): void {
    this.paragraphs = paragraphsOf(text);
  }

  /** What shows at `now`; null before anything readable came. */
  at(now: number): Reading | null {
    const elapsed = this.last === null ? 0 : Math.max(0, now - this.last);
    this.last = now;
    const waiting = this.waiting();
    const words = this.paragraphs[this.current] ?? [];
    if (words.length === 0) {
      const next = waiting.at(-1);
      if (next === undefined) return null;
      this.go(next, now);
    } else {
      this.read = Math.min(words.length, this.read + (elapsed * WORDS_PER_SECOND) / 1_000);
      if (this.read < words.length) this.finished = null;
      else this.finished ??= now;
      const behind = waiting.length >= 2;
      const next = behind ? waiting.at(-1) : waiting[0];
      const held = this.finished !== null && now - this.finished >= HOLD_MS;
      if (next !== undefined && (held || (behind && now - this.started >= DWELL_MS)))
        this.go(next, now);
    }
    const shown = this.paragraphs[this.current] ?? [];
    return { paragraph: this.current, text: shown.slice(0, Math.ceil(this.read)).join(" ") };
  }

  /** The readable paragraphs after the current one. */
  private waiting(): number[] {
    const out: number[] = [];
    for (let i = this.current + 1; i < this.paragraphs.length; i++)
      if (this.paragraphs[i]?.length) out.push(i);
    return out;
  }

  private go(paragraph: number, now: number): void {
    this.current = paragraph;
    this.read = 1;
    this.started = now;
    this.finished = null;
  }
}
