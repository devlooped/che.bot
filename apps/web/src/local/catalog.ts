import type { CatalogModel } from "@chebot/providers";
import { MODEL_ROLES, takesEffort } from "@chebot/providers";

// The Gateway catalog of the local mode: the default model of every role, plus a few other
// families and an older version, so that the admin page has something to choose from. Never
// fetched: the local mode calls no outside service.

const PANEL_EFFORTS = ["low", "medium", "high"];

const model = (id: string, type = "language", efforts: string[] = PANEL_EFFORTS): CatalogModel => ({
  id,
  name: id,
  type,
  tags: [],
  efforts,
});

export const LOCAL_CATALOG: CatalogModel[] = [
  ...MODEL_ROLES.map((role) =>
    model(role.defaultId, role.kind, takesEffort(role.kind) ? PANEL_EFFORTS : []),
  ),
  model("openai/gpt-image-2", "image", []),
  model("anthropic/claude-opus-5.1"),
  model("anthropic/claude-sonnet-5.5"),
  model("openai/gpt-6.1-mini", "language", ["minimal", "low", "medium", "high"]),
  model("google/gemini-4-flash"),
  model("spacexai/grok-4.7-fast", "language", []),
];
