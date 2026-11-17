/** The kinds of model calls a run makes. The schema of each is `SCHEMAS[kind]`. */
export type CallKind =
  | "draft"
  | "merge"
  | "round1"
  | "round2"
  | "round3"
  | "dedupe"
  | "editor"
  | "editor_check"
  | "moments"
  // chart runs
  | "brief_web"
  | "brief_user"
  | "chart_merge"
  | "chart_spec"
  | "chart_round1"
  | "chart_round2"
  | "chart_round3"
  /** The render gate: executed by the renderer, not a model (see `RenderRequest`). */
  | "render";

export type EditorPolicy = "closest" | "rotation";

/**
 * The limits of a run. Stored in the run state, so a run keeps the limits it started with;
 * the evaluation overrides them per run.
 */
export interface RunConfig {
  /** The budget of the question in USD: a stage starts only if spent + its worst case fits. */
  budgetUsd: number;
  callTimeoutMs: {
    /** Drafts and the briefs of a web chart (both search). */
    draft: number;
    /** Merges and the chart spec. */
    merge: number;
    /** Rounds and the briefs of a chart of the user's table. */
    round: number;
    editor: number;
    utility: number;
    render: number;
  };
  deadlineMs: { quick: number; thorough: number };
  searchResultsPerDraft: number;
  /** Worst-case cost of one call of each kind, used by the budget check before a stage. */
  worstCaseUsd: Record<CallKind, number>;
  maxOutputTokens: Record<CallKind, number>;
  /** Suggestions kept per model and round; extras are cut in order. */
  caps: { round1: number; round2: number };
  /** Fewer answers than this: drafts skip the rounds, a round ends the rounds. */
  quorum: number;
  /** Read when the editing step is computed, so a cloned state can finish both ways. */
  editorPolicy: EditorPolicy;
  /** The language of the interface, in which the moments are written. */
  interfaceLanguage: string;
  /** "templates" never calls the utility model for moments. */
  moments: "model" | "templates";
}

export const DEFAULT_CONFIG: RunConfig = {
  budgetUsd: 3,
  // A run is asynchronous (one stage per alarm of its Durable Object, the reader can leave), so a
  // timeout only ends a call that hangs: it is an abstention and the run goes on with the others.
  // Sized for the panel at high effort: 5 min for a draft or a brief with search, 4 for a round,
  // 3 for the merge, a chart spec and the editor, 1 for a utility call. The calls of a stage run in
  // parallel and the one retry of a call runs within its timeout, so the longest stage (the drafts)
  // takes 5 min, well under the 15 min of an alarm. A render of a few specs took 10-60 ms in the
  // Workers runtime (step 36); 15 s bounds a hang.
  callTimeoutMs: {
    draft: 300_000,
    merge: 180_000,
    round: 240_000,
    editor: 180_000,
    utility: 60_000,
    render: 15_000,
  },
  // The deadline ends a run that is stuck, not a slow one. With every call at its full timeout a
  // thorough run takes at most 32 min: drafts 5, merge 3 and moments 1, three rounds of 4 each with
  // a duplicate check and moments (1 + 1), the editor 3, its check 1 and moments 1; a chart run
  // about 33. 35 min lets every stage start (run.test.ts drives it). A quick run takes 9 min that
  // way, a chart 13.5: 15 min.
  deadlineMs: { quick: 900_000, thorough: 2_100_000 },
  searchResultsPerDraft: 10,
  // The worst case of a call: its input and its output cap at the prices of the dearest panel model
  // (Claude Opus, about US$4 and US$20 per million tokens in phase 1); a draft reads up to ~32,000
  // tokens of search results, a round ~10,000. A stage starts only if what is spent plus its worst
  // case fits the budget, so the budget, not the caps, bounds the spend of a run.
  worstCaseUsd: {
    draft: 0.55,
    merge: 0.06,
    round1: 0.36,
    round2: 0.36,
    round3: 0.23,
    dedupe: 0.02,
    editor: 0.35,
    editor_check: 0.02,
    moments: 0.005,
    brief_web: 0.5,
    brief_user: 0.36,
    chart_merge: 0.06,
    chart_spec: 0.31,
    chart_round1: 0.34,
    chart_round2: 0.34,
    chart_round3: 0.21,
    render: 0,
  },
  // A reasoning model spends its cap on reasoning and answer together, and an answer cut off is an
  // invalid output (an abstention). Measured in phase 1 at low and medium effort: a draft up to
  // 3,900 output tokens, a round 2,900 (Grok at low effort), an edit 1,400. The panel runs at high
  // effort, which reasons several times longer: its caps leave about five times the largest answer
  // measured. The utility model takes no effort: a merge of 4 long drafts took 5,500 tokens; it was
  // cut off at 800 on a duplicate check of 7 suggestions and at 400 on moments.
  maxOutputTokens: {
    draft: 20000,
    merge: 10000,
    round1: 16000,
    round2: 16000,
    round3: 10000,
    dedupe: 2000,
    editor: 16000,
    editor_check: 2000,
    moments: 800,
    brief_web: 20000,
    brief_user: 16000,
    chart_merge: 6000,
    chart_spec: 12000,
    chart_round1: 16000,
    chart_round2: 16000,
    chart_round3: 10000,
    render: 0,
  },
  caps: { round1: 3, round2: 2 },
  quorum: 3,
  editorPolicy: "closest",
  interfaceLanguage: "es-AR",
  moments: "model",
};

export interface ConfigOverrides {
  budgetUsd?: number;
  callTimeoutMs?: Partial<RunConfig["callTimeoutMs"]>;
  deadlineMs?: Partial<RunConfig["deadlineMs"]>;
  searchResultsPerDraft?: number;
  worstCaseUsd?: Partial<RunConfig["worstCaseUsd"]>;
  maxOutputTokens?: Partial<RunConfig["maxOutputTokens"]>;
  caps?: Partial<RunConfig["caps"]>;
  quorum?: number;
  editorPolicy?: EditorPolicy;
  interfaceLanguage?: string;
  moments?: RunConfig["moments"];
}

export function resolveConfig(overrides: ConfigOverrides = {}): RunConfig {
  const d = DEFAULT_CONFIG;
  return {
    budgetUsd: overrides.budgetUsd ?? d.budgetUsd,
    callTimeoutMs: { ...d.callTimeoutMs, ...overrides.callTimeoutMs },
    deadlineMs: { ...d.deadlineMs, ...overrides.deadlineMs },
    searchResultsPerDraft: overrides.searchResultsPerDraft ?? d.searchResultsPerDraft,
    worstCaseUsd: { ...d.worstCaseUsd, ...overrides.worstCaseUsd },
    maxOutputTokens: { ...d.maxOutputTokens, ...overrides.maxOutputTokens },
    caps: { ...d.caps, ...overrides.caps },
    quorum: overrides.quorum ?? d.quorum,
    editorPolicy: overrides.editorPolicy ?? d.editorPolicy,
    interfaceLanguage: overrides.interfaceLanguage ?? d.interfaceLanguage,
    moments: overrides.moments ?? d.moments,
  };
}
