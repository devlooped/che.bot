import type { CatalogModel } from "./catalog.ts";
import { latestModel, modelFamily } from "./families.ts";
import type { ModelRef } from "./provider.ts";
import { MODEL_ROLES, type RoleKey } from "./roles.ts";

/** A row of model_settings: the role and the family it uses (an old version is read as its family). */
export interface ModelSetting {
  role: string;
  modelId: string;
  effort: string | null;
}

/** The concrete models of one run, stored with it and carried by run.started. */
export type ModelSnapshot = Record<RoleKey, ModelRef>;

/**
 * Resolves every role to the newest model of its family in the catalog, among the models
 * of the role's kind. A missing setting means the role's default; rows for unknown roles
 * are ignored. Throws when a family has no model of that kind in the catalog.
 */
export function resolveModels(
  settings: readonly ModelSetting[],
  catalog: readonly CatalogModel[],
): ModelSnapshot {
  const entries = MODEL_ROLES.map((role): [RoleKey, ModelRef] => {
    const setting = settings.find((row) => row.role === role.key);
    const family = modelFamily(setting?.modelId ?? role.defaultId);
    const latest = latestModel(
      family,
      catalog.filter((model) => model.type === role.kind),
    );
    if (!latest)
      throw new Error(
        `No ${role.kind} model of the family ${family} in the catalog (${role.key}).`,
      );
    // A decision model takes no reasoning effort.
    const effort = role.kind === "decision" ? null : setting ? setting.effort : role.defaultEffort;
    return [role.key, { id: latest.id, effort }];
  });
  return Object.fromEntries(entries) as ModelSnapshot;
}
