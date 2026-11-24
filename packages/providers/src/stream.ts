import type { LanguageModelMiddleware } from "ai";

// What a call says along the way, for the page of a run: the model is asked for a stream, and the
// stream is put back together into the one result `generateText` expects, so that the call keeps
// every rule of a non-streamed call (its output, its steps, its errors) and only gains the text.

type WrapGenerate = NonNullable<LanguageModelMiddleware["wrapGenerate"]>;
type GenerateResult = Awaited<ReturnType<WrapGenerate>>;
type StreamResult = Awaited<ReturnType<Parameters<WrapGenerate>[0]["doStream"]>>;
type StreamPart = StreamResult["stream"] extends ReadableStream<infer P> ? P : never;
type Content = GenerateResult["content"][number];
type Metadata = GenerateResult["providerMetadata"];

/**
 * Receives what the model thinks and writes as prose, as it comes: its reasoning, the text of its
 * answer, and in a structured output (JSON) the prose of its string values (JsonProse). Every new
 * part starts with a blank line.
 */
export type ProgressListener = (text: string) => void;

/** The middleware that makes `generateText` stream and tells `listener` the prose of the stream. */
export function progressMiddleware(listener: ProgressListener): LanguageModelMiddleware {
  return {
    wrapGenerate: async ({ doStream }) => assemble(await doStream(), listener),
  };
}

/** Each delta of a provider may carry metadata (a signature of the reasoning): the last of each provider wins. */
function merge(into: Metadata, more: Metadata): Metadata {
  if (!more) return into;
  const merged: NonNullable<Metadata> = { ...into };
  for (const [provider, values] of Object.entries(more))
    merged[provider] = { ...merged[provider], ...values };
  return merged;
}

/** Text whose first character opens JSON or a code block is the structured output, not prose. */
const STRUCTURED = /^[[{`]/;

/** A string value of JSON this long, with a blank in it and not a URL, is prose. */
const PROSE_CHARS = 20;
const ESCAPES: Record<string, string> = { n: "\n", r: "", t: " ", b: "", f: "" };

/**
 * The prose of a JSON text as it streams: the string values the model writes (an answer, a
 * suggestion, a reason), told character by character once they read as prose; keys, ids, labels
 * and URLs are left out. A model that does not show its reasoning (OpenAI, when it may search)
 * still shows what it writes.
 */
export class JsonProse {
  private inString = false;
  /** null outside an escape; "" just after a backslash; "u…" while reading a \u escape. */
  private escape: string | null = null;
  private value = "";
  private prose = false;

  constructor(private readonly say: (text: string, first: boolean) => void) {}

  push(text: string): void {
    for (const char of text) this.read(char);
  }

  private read(char: string): void {
    if (!this.inString) {
      if (char === '"') {
        this.inString = true;
        this.value = "";
        this.prose = false;
      }
      return;
    }
    if (this.escape === "") {
      if (char === "u") this.escape = "u";
      else {
        this.escape = null;
        this.add(ESCAPES[char] ?? char);
      }
      return;
    }
    if (this.escape !== null) {
      this.escape += char;
      if (this.escape.length < 5) return;
      const code = Number.parseInt(this.escape.slice(1), 16);
      this.escape = null;
      if (!Number.isNaN(code)) this.add(String.fromCharCode(code));
      return;
    }
    if (char === "\\") this.escape = "";
    else if (char === '"') this.inString = false;
    else this.add(char);
  }

  private add(text: string): void {
    if (this.prose) {
      this.say(text, false);
      return;
    }
    this.value += text;
    if (this.value.length < PROSE_CHARS || !/\s/.test(this.value) || /^https?:/.test(this.value))
      return;
    this.prose = true;
    this.say(this.value.trimStart(), true);
  }
}

/** The result of doGenerate, from the parts of doStream; an error part is thrown. */
export async function assemble(
  result: StreamResult,
  listener: ProgressListener,
): Promise<GenerateResult> {
  const content: Content[] = [];
  const open = new Map<
    string,
    {
      part: Extract<Content, { type: "text" | "reasoning" }>;
      /** null while only blanks came: whether it is prose is not known yet. */
      prose: boolean | null;
      /** The prose inside a structured output. */
      json: JsonProse | null;
    }
  >();
  let warnings: GenerateResult["warnings"] = [];
  let response: GenerateResult["response"] = {};
  let finish: Extract<StreamPart, { type: "finish" }> | null = null;
  let spoken = false;

  const say = (text: string, first: boolean) => {
    if (!text) return;
    listener(first && spoken ? `\n\n${text}` : text);
    spoken = true;
  };
  const begin = (type: "text" | "reasoning", id: string, providerMetadata: Metadata) => {
    const part = { type, text: "", ...(providerMetadata ? { providerMetadata } : {}) } as Extract<
      Content,
      { type: "text" | "reasoning" }
    >;
    content.push(part);
    open.set(`${type}:${id}`, { part, prose: type === "reasoning" ? true : null, json: null });
  };
  const add = (type: "text" | "reasoning", id: string, delta: string, metadata: Metadata) => {
    const key = `${type}:${id}`;
    if (!open.has(key)) begin(type, id, undefined);
    const entry = open.get(key);
    if (!entry) return;
    const first = entry.part.text.trim() === "";
    entry.part.text += delta;
    const merged = merge(entry.part.providerMetadata, metadata);
    if (merged) entry.part.providerMetadata = merged;
    if (entry.prose === null) {
      const start = entry.part.text.trimStart();
      if (!start) return;
      entry.prose = !STRUCTURED.test(start);
      if (entry.prose) say(start, true);
      else {
        entry.json = new JsonProse(say);
        entry.json.push(start);
      }
      return;
    }
    if (entry.prose) say(first ? delta.trimStart() : delta, first);
    else entry.json?.push(delta);
  };
  const end = (type: "text" | "reasoning", id: string, metadata: Metadata) => {
    const entry = open.get(`${type}:${id}`);
    if (!entry) return;
    const merged = merge(entry.part.providerMetadata, metadata);
    if (merged) entry.part.providerMetadata = merged;
    open.delete(`${type}:${id}`);
  };

  const reader = result.stream.getReader();
  try {
    for (;;) {
      const { done, value: part } = await reader.read();
      if (done) break;
      switch (part.type) {
        case "stream-start":
          warnings = part.warnings;
          break;
        case "response-metadata": {
          const { type: _, ...metadata } = part;
          response = { ...response, ...metadata };
          break;
        }
        case "text-start":
        case "reasoning-start":
          begin(part.type === "text-start" ? "text" : "reasoning", part.id, part.providerMetadata);
          break;
        case "text-delta":
          add("text", part.id, part.delta, part.providerMetadata);
          break;
        case "reasoning-delta":
          add("reasoning", part.id, part.delta, part.providerMetadata);
          break;
        case "text-end":
          end("text", part.id, part.providerMetadata);
          break;
        case "reasoning-end":
          end("reasoning", part.id, part.providerMetadata);
          break;
        case "tool-input-start":
        case "tool-input-delta":
        case "tool-input-end":
        case "ping":
        case "raw":
          // a tool call arrives whole after its input; nothing of it is prose
          break;
        case "finish":
          finish = part;
          break;
        case "error":
          throw part.error;
        default:
          // tool calls, tool results, sources, files: the same shape as their content
          content.push(part as Content);
      }
    }
  } finally {
    reader.releaseLock();
  }
  if (!finish) throw new Error("The stream of the model ended without finishing.");
  return {
    content,
    finishReason: finish.finishReason,
    usage: finish.usage,
    ...(finish.providerMetadata ? { providerMetadata: finish.providerMetadata } : {}),
    ...(result.request ? { request: result.request } : {}),
    response: {
      ...response,
      ...(result.response?.headers ? { headers: result.response.headers } : {}),
    },
    warnings,
  };
}
