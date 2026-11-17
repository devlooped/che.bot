import type { Env } from "./env.ts";

/** Who calls the API: a signed-in user with the roles of the token, or nobody. */
export type Identity = { kind: "anonymous" } | { kind: "user"; userId: string; roles: string[] };

export type User = Extract<Identity, { kind: "user" }>;

/**
 * Resolves the caller of a request; throws when the request carries credentials that are not
 * valid (401). `handle` calls `deps.identify` once per request, and every route reads the result:
 * in production it is the Auth0 check of auth0.ts.
 */
export type IdentityResolver = (request: Request, env: Env) => Promise<Identity>;

/** The roles the app reads, exactly as the token carries them. */
export const ROLES = { admin: "admin", beta: "beta" } as const;

export function isAdmin(identity: Identity): boolean {
  return identity.kind === "user" && identity.roles.includes(ROLES.admin);
}

/** Whether the app is open to every signed-in user: LAUNCHED is "true". */
export function launched(env: Pick<Env, "LAUNCHED">): boolean {
  return env.LAUNCHED?.trim().toLowerCase() === "true";
}

/** Until launch, asking needs the admin or the beta role; after it, any signed-in user asks. */
export function mayAsk(user: User, env: Pick<Env, "LAUNCHED">): boolean {
  return launched(env) || user.roles.includes(ROLES.admin) || user.roles.includes(ROLES.beta);
}
