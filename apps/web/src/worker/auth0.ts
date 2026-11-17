import { createRemoteJWKSet, type JWTPayload, type JWTVerifyGetKey, jwtVerify } from "jose";
import type { Env } from "./env.ts";
import type { Identity } from "./identity.ts";

// Sign-in: the React app signs in with the Auth0 SPA SDK and sends its access token as
// `Authorization: Bearer <token>`. The Worker verifies it against the keys of the tenant (RS256,
// issuer and audience), takes the user from `sub` and the roles from the roles claim.

/** "tenant.us.auth0.com", whether AUTH0_DOMAIN carries a scheme or a trailing slash or not. */
export function auth0Host(domain: string): string {
  const host = domain
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");
  if (!host) throw new Error("AUTH0_DOMAIN is not set.");
  return host;
}

/** The issuer of the tenant's tokens: `https://<domain>/`, with the trailing slash. */
export const auth0Issuer = (domain: string) => `https://${auth0Host(domain)}/`;

const jwksByHost = new Map<string, JWTVerifyGetKey>();

/**
 * The public keys of the tenant, from its JWKS document. One cache per isolate and tenant: the
 * keys are kept 10 minutes, and a token signed with an unknown key refetches them at most every
 * 30 seconds (jose's defaults).
 */
export function auth0Jwks(env: Pick<Env, "AUTH0_DOMAIN">): JWTVerifyGetKey {
  const host = auth0Host(env.AUTH0_DOMAIN);
  let jwks = jwksByHost.get(host);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`https://${host}/.well-known/jwks.json`));
    jwksByHost.set(host, jwks);
  }
  return jwks;
}

/**
 * A role claim, as the existing app reads it: `roles` or `role`, alone or at the end of a
 * namespaced claim such as `https://che.bot/roles` (Auth0 requires a namespace for custom claims
 * of an access token, set by a post-login Action).
 */
const ROLE_CLAIM = /^(?:.*[/:.])?roles?$/i;

/** The roles of a token: every string of every role claim, merged. */
export function rolesOf(payload: JWTPayload): string[] {
  const roles = new Set<string>();
  for (const [key, value] of Object.entries(payload)) {
    if (!ROLE_CLAIM.test(key)) continue;
    const values = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
    for (const role of values) if (typeof role === "string") roles.add(role);
  }
  return [...roles];
}

/** Verifies an access token of the tenant; throws when it is not valid for this API. */
export async function verifyAccessToken(
  token: string,
  env: Pick<Env, "AUTH0_DOMAIN" | "AUTH0_AUDIENCE">,
  jwks: JWTVerifyGetKey,
): Promise<Extract<Identity, { kind: "user" }>> {
  const audience = env.AUTH0_AUDIENCE.trim();
  if (!audience) throw new Error("AUTH0_AUDIENCE is not set.");
  const { payload } = await jwtVerify(token, jwks, {
    issuer: auth0Issuer(env.AUTH0_DOMAIN),
    audience,
    algorithms: ["RS256"],
    requiredClaims: ["sub", "exp"],
  });
  if (!payload.sub) throw new Error("The token has no subject.");
  return { kind: "user", userId: payload.sub, roles: rolesOf(payload) };
}

/**
 * The caller of a request: anonymous without an Authorization header, the user of a valid access
 * token, and an error (401) for any other header, so that a stale token is never read as signed out.
 */
export async function auth0Identity(
  request: Request,
  env: Pick<Env, "AUTH0_DOMAIN" | "AUTH0_AUDIENCE">,
  jwks: JWTVerifyGetKey,
): Promise<Identity> {
  const header = request.headers.get("authorization");
  if (header === null) return { kind: "anonymous" };
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  if (!match?.[1]) throw new Error("The Authorization header is not a bearer token.");
  return verifyAccessToken(match[1], env, jwks);
}
