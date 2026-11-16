export interface CatalogModel {
  id: string;
  name: string;
  /** "language", "decision", "image", "embedding"… as the Gateway lists it, with "evaluation" read as "decision". */
  type: string;
  tags: string[];
  efforts: string[];
}

export const GATEWAY_MODELS_URL = "https://ai-gateway.vercel.sh/v1/models";

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

// The Gateway lists decision models (the models of experimental_decide) under the type
// "evaluation"; the roles call that kind "decision".
const kind = (type: unknown): string =>
  typeof type !== "string" ? "" : type === "evaluation" ? "decision" : type;

// Every kind is kept, decision models included: the reader of the existing app kept only
// language and image models.
export function parseCatalog(body: unknown): CatalogModel[] {
  const data = (body as { data?: unknown } | null)?.data;
  if (!Array.isArray(data))
    throw new Error("The AI Gateway catalog does not have the expected shape.");
  return data
    .flatMap((entry): CatalogModel[] => {
      const model = entry as Record<string, unknown> | null;
      if (typeof model?.id !== "string") return [];
      const effort = Array.isArray(model.reasoning_options)
        ? (model.reasoning_options as Array<Record<string, unknown> | null>).find(
            (option) => option?.type === "effort",
          )
        : undefined;
      return [
        {
          id: model.id,
          name: typeof model.name === "string" ? model.name : model.id,
          type: kind(model.type),
          tags: strings(model.tags),
          efforts: strings(effort?.values).filter((value) => value !== "none"),
        },
      ];
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

export async function fetchGatewayCatalog(
  fetch: typeof globalThis.fetch = globalThis.fetch,
  url = GATEWAY_MODELS_URL,
): Promise<CatalogModel[]> {
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`The AI Gateway catalog answered ${response.status}.`);
  const models = parseCatalog(await response.json());
  if (!models.length) throw new Error("The AI Gateway catalog is empty.");
  return models;
}

// Shared per process (or per Worker isolate); concurrent reads are coalesced.
// A failed refresh keeps the last good copy for a minute; a failure is never cached.
export function cachedCatalog(
  read: () => Promise<CatalogModel[]>,
  ttl = 3_600_000,
  now: () => number = Date.now,
): () => Promise<CatalogModel[]> {
  let value: CatalogModel[] | undefined;
  let expires = 0;
  let pending: Promise<CatalogModel[]> | undefined;
  return async () => {
    if (value && now() < expires) return value;
    pending ??= read()
      .then((models) => {
        value = models;
        expires = now() + ttl;
        return models;
      })
      .catch((error: unknown) => {
        if (!value) throw error;
        console.warn("The model catalog could not be refreshed; the last copy is used.");
        expires = now() + Math.min(ttl, 60_000);
        return value;
      })
      .finally(() => {
        pending = undefined;
      });
    return pending;
  };
}

export const gatewayCatalog = cachedCatalog(() => fetchGatewayCatalog());
