// Defaults; an admin overrides them from the settings page. A setting names a family,
// and resolveModels() picks the newest model of it in the Gateway catalog.
export const MODEL_ROLES = [
  // Low for Grok: at medium, grok-4.7 reasoned past 180 s on a round and 66 s on the editor pass
  // (phase 1); at low, 34 s and 17 s, inside the call timeouts.
  { key: "panel.grok", kind: "language", defaultId: "spacexai/grok-4.7", defaultEffort: "low" },
  {
    key: "panel.claude",
    kind: "language",
    defaultId: "anthropic/claude-opus-5.5",
    defaultEffort: "medium",
  },
  {
    key: "panel.openai",
    kind: "language",
    defaultId: "openai/gpt-6.1-sol",
    defaultEffort: "medium",
  },
  {
    key: "panel.gemini",
    kind: "language",
    defaultId: "google/gemini-4-argon",
    defaultEffort: "medium",
  },
  // Merge, duplicates, moments, editor check.
  {
    key: "utility",
    kind: "language",
    defaultId: "anthropic/claude-haiku-5.5",
    defaultEffort: null,
  },
  { key: "classifier", kind: "decision", defaultId: "typesafe-ai/jev", defaultEffort: null },
] as const;

export type ModelRole = (typeof MODEL_ROLES)[number];
export type RoleKey = ModelRole["key"];
export type RoleKind = ModelRole["kind"];

export const ROLE_KEYS: readonly RoleKey[] = MODEL_ROLES.map((role) => role.key);

export function modelRole(key: string): ModelRole | undefined {
  return MODEL_ROLES.find((role) => role.key === key);
}
