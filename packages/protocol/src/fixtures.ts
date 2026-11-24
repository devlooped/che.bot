// Test support, not exported by the package: a minimal driver loop and builders of call results.
// The real fake provider lives in packages/providers.
import { appendEvents, type LoggedEvent, type RunEvent } from "./events.ts";
import { MODELS, type ModelId } from "./model.ts";
import {
  type Call,
  type CallResult,
  type CallsStep,
  type CreateRunInput,
  createRun,
  type FoundSource,
  nextStep,
  type RunState,
  reduce,
} from "./reducer.ts";

export const T0 = 1_700_000_000_000;

export const SNAPSHOT_MODELS = {
  "panel.grok": { id: "spacexai/grok-4.7", effort: "medium" },
  "panel.claude": { id: "anthropic/claude-opus-5.5", effort: "medium" },
  "panel.openai": { id: "openai/gpt-6.1-sol", effort: "medium" },
  "panel.gemini": { id: "google/gemini-4-argon", effort: "medium" },
  utility: { id: "anthropic/claude-haiku-5.5", effort: null },
};

export type Responder = (call: Call, state: RunState) => CallResult | null;

export function ok(
  call: Call,
  output: unknown,
  extra: { sources?: FoundSource[]; costUsd?: number; latencyMs?: number } = {},
): CallResult {
  return {
    status: "ok",
    key: call.key,
    output,
    sources: extra.sources ?? [],
    usage: { inputTokens: 100, outputTokens: 50 },
    costUsd: extra.costUsd ?? (call.seat === "utility" ? 0.001 : 0.02),
    latencyMs: extra.latencyMs ?? 1000,
  };
}

export function abstain(
  call: Call,
  reason: "timeout" | "invalid" | "refusal" | "error" = "timeout",
): CallResult {
  return { status: "abstained", key: call.key, reason, costUsd: 0, latencyMs: call.timeoutMs };
}

export interface Driven {
  state: RunState;
  log: LoggedEvent[];
  steps: CallsStep[];
  /** The state just before each step was reduced, by step id. */
  before: Record<string, RunState>;
}

/**
 * Runs a run to its end: next step, responses, reduce, append, as the Durable Object will. `tick`
 * is the time a step takes; `permute` reorders each results array (the property test).
 */
export function drive(
  input: Partial<CreateRunInput> & Pick<CreateRunInput, "mode">,
  respond: Responder,
  options: {
    tick?: (step: CallsStep) => number;
    permute?: (results: CallResult[], stepIndex: number) => CallResult[];
    maxSteps?: number;
  } = {},
): Driven {
  const created = createRun(
    {
      id: input.id ?? "run-1",
      question: input.question ?? "¿Cuál es la capital de Australia y cuánta gente vive ahí?",
      mode: input.mode,
      models: input.models ?? SNAPSHOT_MODELS,
      ...(input.config ? { config: input.config } : {}),
    },
    T0,
  );
  let state = created.state;
  let log = appendEvents([], created.events, T0).log;
  let now = T0;
  const steps: CallsStep[] = [];
  const before: Record<string, RunState> = {};
  for (let i = 0; i < (options.maxSteps ?? 100); i++) {
    const step = nextStep(state, now);
    if (step.kind === "done") return { state, log, steps, before };
    steps.push(step);
    before[step.id] = state;
    let results = step.calls.flatMap((c) => {
      const r = respond(c, state);
      return r ? [r] : [];
    });
    if (options.permute) results = options.permute(results, i);
    now += options.tick?.(step) ?? 1000;
    const reduced = reduce(state, step, results, now);
    state = reduced.state;
    log = appendEvents(log, reduced.events, now).log;
  }
  throw new Error("the run did not end");
}

export function eventsOf<T extends RunEvent["type"]>(log: readonly RunEvent[], type: T) {
  return log.filter((e): e is Extract<RunEvent, { type: T }> => e.type === type);
}

// ---------------------------------------------------------------------------------------------
// The scripted thorough run used by run.test.ts. Three paragraphs are seeded:
//   p1 "Canberra is the capital" (grok, claude, openai: conflicts with gemini's Sydney claim)
//   p2 "Some say Sydney" (gemini)
//   p3 "About 460,000 people" (all four)
// Round 1: grok deletes p2 and claude does the same (merged by code), grok replaces p3 with a
// wrong figure, openai and gemini replace p1 in other words (merged by the utility model), gemini
// inserts after p3. Round 2: t1 and t3 accepted, claude adds an alternative to t2 (p3 is locked),
// openai inserts after p1 citing one known and one unknown source. Round 3: grok and openai change
// position with a reason (t2 goes to claude's alternative), openai's change on t4 without a reason
// is ignored (t4 ends unresolved), t5 is accepted. The editor rewrites p1 (kept) and p3 (dropped).

const DRAFT_CLAIMS: Record<ModelId, { text: string; sources: string[] }[]> = {
  grok: [
    { text: "La capital de Australia es Canberra.", sources: ["https://example.org/canberra"] },
    { text: "Canberra tiene unos 460.000 habitantes.", sources: ["https://typed.example/nope"] },
  ],
  claude: [
    { text: "Canberra es la capital australiana.", sources: [] },
    { text: "En Canberra viven alrededor de 460.000 personas.", sources: [] },
  ],
  openai: [
    { text: "Canberra es la capital de Australia.", sources: ["https://example.org/canberra"] },
    { text: "Su población ronda las 460.000 personas.", sources: [] },
  ],
  gemini: [
    { text: "La capital de Australia es Sídney.", sources: [] },
    { text: "Canberra tiene cerca de 460.000 habitantes.", sources: ["https://example.org/abs"] },
  ],
};

const FOUND: Record<ModelId, FoundSource[]> = {
  grok: [
    { url: "https://example.org/canberra", title: "Canberra", quote: "Canberra is the capital" },
  ],
  claude: [],
  openai: [
    { url: "https://example.org/canberra", title: "Canberra", quote: "Canberra is the capital" },
  ],
  gemini: [{ url: "https://example.org/abs", title: "ABS", quote: "456,000 people" }],
};

function suggestion(
  paragraph: string,
  op: string,
  text: string,
  reason: string,
  sources: string[] = [],
) {
  return { paragraph, op, kind: "wrong", text, reason, sources };
}

export const scripted: Responder = (call, state) => {
  const [, n, seat] = call.key.split(":") as [string, string, ModelId | undefined];
  switch (call.kind) {
    case "draft": {
      const m = seat as ModelId;
      return ok(
        call,
        {
          answer: DRAFT_CLAIMS[m].map((c) => c.text).join("\n\n"),
          claims: DRAFT_CLAIMS[m].map((c) => ({ ...c, confidence: "high" })),
          charts: [],
          verdict: { kind: "fact", rating: "none" },
        },
        { sources: FOUND[m], costUsd: 0.05 },
      );
    }
    case "merge": {
      const ids = (pairs: [ModelId, number][]) =>
        pairs.flatMap(([m, n]) => state.drafts.find((d) => d.model === m)?.claims[n - 1] ?? []);
      const [sydney] = ids([["gemini", 1]]);
      const [canberra] = ids([["grok", 1]]);
      return ok(call, {
        paragraphs: [
          {
            text: "La capital de Australia es Canberra.",
            claims: ids([
              ["grok", 1],
              ["claude", 1],
              ["openai", 1],
            ]),
          },
          { text: "Algunos dicen que es Sídney.", claims: ids([["gemini", 1]]) },
          {
            text: "En Canberra viven unas 460.000 personas.",
            claims: ids(MODELS.map((m) => [m, 2])),
          },
        ],
        conflicts: sydney && canberra ? [{ first: canberra, second: sydney }] : [],
      });
    }
    case "round1": {
      const by: Record<ModelId, unknown[]> = {
        grok: [
          suggestion("p2", "delete", "", "Sídney no es la capital."),
          suggestion(
            "p3",
            "replace",
            "En Canberra viven unas 500.000 personas.",
            "La cifra está desactualizada.",
          ),
        ],
        claude: [suggestion("p2", "delete", "", "Es un error conocido.")],
        openai: [
          suggestion(
            "p1",
            "replace",
            "Canberra es la capital de Australia, no Sídney.",
            "Conviene descartar el error común.",
          ),
        ],
        gemini: [
          suggestion(
            "p1",
            "replace",
            "La capital es Canberra y no Sídney.",
            "Falta aclarar el error común.",
          ),
          {
            ...suggestion(
              "p3",
              "insert_after",
              "Canberra fue elegida capital en 1908.",
              "Falta el origen de la capital.",
            ),
            kind: "missing",
          },
        ],
      };
      return ok(call, { suggestions: by[seat as ModelId], patches: [], checks: [] });
    }
    case "round2": {
      const votes: Record<ModelId, { thread: string; choice: string; reason: string }[]> = {
        grok: [
          { thread: "t3", choice: "s3", reason: "" },
          { thread: "t4", choice: "keep", reason: "" },
        ],
        claude: [
          { thread: "t2", choice: "keep", reason: "" },
          { thread: "t3", choice: "keep", reason: "" },
          { thread: "t4", choice: "s4", reason: "" },
        ],
        openai: [
          { thread: "t1", choice: "s1", reason: "" },
          { thread: "t2", choice: "keep", reason: "" },
          { thread: "t4", choice: "keep", reason: "" },
        ],
        gemini: [
          { thread: "t1", choice: "keep", reason: "" },
          { thread: "t2", choice: "keep", reason: "" },
        ],
      };
      const suggestions: Record<ModelId, unknown[]> = {
        grok: [],
        claude: [
          suggestion(
            "p3",
            "replace",
            "En Canberra viven unas 460.000 personas, según el censo de 2021.",
            "Falta la fecha de la cifra.",
          ),
        ],
        openai: [
          {
            ...suggestion(
              "p1",
              "insert_after",
              "Es la ciudad más grande del interior del país.",
              "Falta un dato de contexto.",
              ["src1", "src99"],
            ),
            kind: "missing",
          },
        ],
        gemini: [],
      };
      const m = seat as ModelId;
      return ok(call, { votes: votes[m], suggestions: suggestions[m], patches: [], checks: [] });
    }
    case "round3": {
      const votes: Record<ModelId, { thread: string; choice: string; reason: string }[]> = {
        grok: [
          { thread: "t2", choice: "s5", reason: "La fecha del censo es mejor que mi cifra." },
          { thread: "t5", choice: "s6", reason: "" },
        ],
        claude: [{ thread: "t5", choice: "s6", reason: "" }],
        openai: [
          { thread: "t2", choice: "s5", reason: "El censo de 2021 respalda la cifra." },
          { thread: "t4", choice: "s4", reason: "" },
        ],
        gemini: [
          { thread: "t2", choice: "keep", reason: "" },
          { thread: "t5", choice: "keep", reason: "" },
        ],
      };
      return ok(call, { votes: votes[seat as ModelId], checks: [] });
    }
    case "dedupe": {
      const pairs = (state.pending?.pairs ?? []).filter((p) => p.decided === null);
      return ok(call, {
        pairs: pairs.map((p) => ({ pair: p.id, verdict: n === "1" ? "same" : "different" })),
      });
    }
    case "editor":
      return ok(call, {
        paragraphs: [
          { id: "p1", text: "Canberra, y no Sídney, es la capital de Australia." },
          { id: "p3", text: "En Canberra viven unas 470.000 personas." },
        ],
      });
    case "editor_check":
      return ok(call, {
        checks: [
          { id: "p1", verdict: "same" },
          { id: "p3", verdict: "changed" },
        ],
      });
    case "moments":
      if (state.stage === "round1") return abstain(call, "error");
      return ok(call, {
        sentences: ["Los cuatro están trabajando.", "", "Hay avances.", "Uno más.", "Y otro."],
      });
    default:
      return null;
  }
};
