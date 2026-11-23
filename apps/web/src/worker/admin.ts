import type { QuestionClass } from "@chebot/protocol";
import {
  type CatalogModel,
  latestFamilyModels,
  latestModel,
  MODEL_ROLES,
  modelFamily,
  modelRole,
  takesEffort,
} from "@chebot/providers";
import { deps } from "./deps.ts";
import type { Env } from "./env.ts";
import {
  type ModelSettingChange,
  readModelSettings,
  readPrices,
  writeModelSettings,
  writePrices,
} from "./settings.ts";

// The admin API: the model of each role (a family and an effort, the families offered from the
// Gateway catalog) and the two prices. Settings are read when a run starts, so a change never
// touches a run already going.

/** The efforts offered for a family whose newest model lists none in the catalog. */
export const KNOWN_EFFORTS = ["minimal", "low", "medium", "high", "xhigh"] as const;

/** The most a price may be, in ARS: a guard against a typo. */
export const MAX_PRICE = 10_000_000;

const CLASSES: readonly QuestionClass[] = ["simple", "complex"];

export interface FamilyOption {
  family: string;
  kind: string;
  /** The model a run would use today. */
  latest: string;
  efforts: string[];
}

/** The families of the catalog, by kind, with the efforts of their newest model. */
export function familyOptions(catalog: readonly CatalogModel[]): FamilyOption[] {
  return latestFamilyModels(catalog).map((family) => {
    const latest = latestModel(
      family.id,
      catalog.filter((model) => model.type === family.type),
    );
    return {
      family: family.id,
      kind: family.type,
      latest: latest?.id ?? family.id,
      efforts: family.efforts.length ? family.efforts : [...KNOWN_EFFORTS],
    };
  });
}

/** GET /api/admin/models: every role with its default and its setting, and the families offered. */
export async function readModels(env: Env) {
  const [settings, catalog] = await Promise.all([readModelSettings(env.DB), deps.catalog(env)]);
  const families = familyOptions(catalog);
  return {
    roles: MODEL_ROLES.map((role) => {
      const setting = settings.find((row) => row.role === role.key);
      return {
        role: role.key,
        kind: role.kind,
        default: { family: modelFamily(role.defaultId), effort: role.defaultEffort },
        setting: setting ? { family: modelFamily(setting.modelId), effort: setting.effort } : null,
      };
    }),
    families: families.filter((option) => MODEL_ROLES.some((role) => role.kind === option.kind)),
  };
}

export type Validation<T> = { ok: true; value: T } | { ok: false; errors: Record<string, string> };

/**
 * The changes of a PUT /api/admin/models body, `{ settings: { [role]: { family, effort } | null } }`:
 * a known role, a family of the catalog of the role's kind (a version is read as its family), and
 * an effort the family offers (none for a decision or an image model). Null puts the role back on its default.
 * Any error refuses the whole body.
 */
export function parseModelSettings(
  body: unknown,
  catalog: readonly CatalogModel[],
): Validation<ModelSettingChange[]> {
  const settings = (body as { settings?: unknown } | null)?.settings;
  if (typeof settings !== "object" || settings === null || Array.isArray(settings))
    return { ok: false, errors: { settings: "Send { settings: { role: { family, effort } } }." } };
  const families = familyOptions(catalog);
  const changes: ModelSettingChange[] = [];
  const errors: Record<string, string> = {};
  for (const [key, value] of Object.entries(settings)) {
    const role = modelRole(key);
    if (!role) {
      errors[key] = "Unknown role.";
      continue;
    }
    if (value === null) {
      changes.push({ role: key, setting: null });
      continue;
    }
    const { family, effort } = (value ?? {}) as { family?: unknown; effort?: unknown };
    if (typeof family !== "string" || !family.includes("/")) {
      errors[key] = "The family is a Gateway id such as anthropic/opus.";
      continue;
    }
    const option = families.find(
      (candidate) => candidate.kind === role.kind && candidate.family === modelFamily(family),
    );
    if (!option) {
      errors[key] = `No ${role.kind} model of the family ${modelFamily(family)} in the catalog.`;
      continue;
    }
    if (effort !== null && effort !== undefined && typeof effort !== "string") {
      errors[key] = "The effort is a string or null.";
      continue;
    }
    const chosen = effort ?? null;
    if (!takesEffort(role.kind) && chosen !== null) {
      errors[key] = `A ${role.kind} model takes no effort.`;
      continue;
    }
    if (chosen !== null && !option.efforts.includes(chosen)) {
      errors[key] = `The effort is one of ${option.efforts.join(", ")}.`;
      continue;
    }
    changes.push({ role: key, setting: { family: option.family, effort: chosen } });
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value: changes };
}

/** The amounts of a PUT /api/admin/prices body, `{ prices: { simple?, complex? } }`, in ARS. */
export function parsePrices(body: unknown): Validation<{ class: QuestionClass; amount: number }[]> {
  const prices = (body as { prices?: unknown } | null)?.prices;
  if (typeof prices !== "object" || prices === null || Array.isArray(prices))
    return { ok: false, errors: { prices: "Send { prices: { simple, complex } }." } };
  const amounts: { class: QuestionClass; amount: number }[] = [];
  const errors: Record<string, string> = {};
  for (const [key, amount] of Object.entries(prices)) {
    const cls = CLASSES.find((c) => c === key);
    if (!cls) errors[key] = "Unknown class.";
    else if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0)
      errors[key] = "The amount is a positive number of ARS.";
    else if (amount > MAX_PRICE) errors[key] = `The amount is at most ${MAX_PRICE} ARS.`;
    else amounts.push({ class: cls, amount });
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value: amounts };
}

export async function updateModels(env: Env, body: unknown, by: string) {
  const parsed = parseModelSettings(body, await deps.catalog(env));
  if (!parsed.ok) return parsed;
  await writeModelSettings(env.DB, parsed.value, by);
  return { ok: true as const, value: await readModels(env) };
}

export async function updatePrices(env: Env, body: unknown) {
  const parsed = parsePrices(body);
  if (!parsed.ok) return parsed;
  await writePrices(env.DB, parsed.value);
  return { ok: true as const, value: { prices: await readPrices(env.DB) } };
}
