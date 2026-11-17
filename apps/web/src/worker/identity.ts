import type { Env } from "./env.ts";

/** Who calls the API: a signed-in user with the roles of the token, or nobody. */
export type Identity = { kind: "anonymous" } | { kind: "user"; userId: string; roles: string[] };

export const ANONYMOUS: Identity = { kind: "anonymous" };

/**
 * Resolves the caller of a request. Every route reads the identity that `handle` gets once per
 * request from `deps.identify`: the Auth0 check of step 18 replaces `noSignIn` there (verify the
 * access token against the tenant's keys, read the roles claim).
 */
export type IdentityResolver = (request: Request, env: Env) => Promise<Identity>;

/** Until the Auth0 check exists, nobody is signed in: every route that needs a user answers 401. */
export const noSignIn: IdentityResolver = async () => ANONYMOUS;

export function isAdmin(identity: Identity): boolean {
  return identity.kind === "user" && identity.roles.includes("admin");
}
