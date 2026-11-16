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
  | "moments";

export type EditorPolicy = "closest" | "rotation";

/**
 * The limits of a run. Stored in the run state, so a run keeps the limits it started with;
 * the evaluation overrides them per run.
 */
export interface RunConfig {
  /** The budget of the question in USD: a stage starts only if spent + its worst case fits. */
  budgetUsd: number;
  callTimeoutMs: { draft: number; merge: number; round: number; editor: number; utility: number };
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
  callTimeoutMs: { draft: 90_000, merge: 60_000, round: 45_000, editor: 60_000, utility: 20_000 },
  deadlineMs: { quick: 120_000, thorough: 240_000 },
  searchResultsPerDraft: 10,
  worstCaseUsd: {
    draft: 0.25,
    merge: 0.03,
    round1: 0.1,
    round2: 0.1,
    round3: 0.06,
    dedupe: 0.01,
    editor: 0.15,
    editor_check: 0.01,
    moments: 0.005,
  },
  maxOutputTokens: {
    draft: 4000,
    merge: 6000,
    round1: 2000,
    round2: 2000,
    round3: 1000,
    dedupe: 800,
    editor: 6000,
    editor_check: 800,
    moments: 400,
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
