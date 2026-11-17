import { type JWTPayload, jwtVerify, SignJWT } from "jose";
import type { Env } from "./env.ts";
import type { Identity, User } from "./identity.ts";

// The session: who signed in, as a token signed with SESSION_SECRET (HS256) in an httpOnly cookie.
// No server-side store: a session ends when its token expires or the cookie is cleared. The roles
// are those of the sign-in; a change of roles in the tenant applies at the next sign-in.
//
// The cookies are `__Host-` cookies (Secure, Path=/, no Domain: no subdomain can set or shadow
// them), except on http://localhost, where a browser keeps no Secure cookie: there they lose the
// prefix and the Secure flag. Each scheme reads only its own names.

/** How long a session lasts from its sign-in: the absolute duration of @auth0/nextjs-auth0. */
export const SESSION_SECONDS = 3 * 24 * 60 * 60;

/** How long a sign-in may take between /auth/login and /auth/callback. */
export const LOGIN_SECONDS = 10 * 60;

/** The audience of each kind of token, so that one is never read as the other. */
const SESSION_AUDIENCE = "chebot:session";
const LOGIN_AUDIENCE = "chebot:login";

/** Whether the cookies of this origin are Secure: everywhere but plain http on this machine. */
export function secureOrigin(url: URL): boolean {
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  return !(url.protocol === "http:" && local);
}

export const sessionCookieName = (url: URL) =>
  secureOrigin(url) ? "__Host-chebot_session" : "chebot_session";
export const loginCookieName = (url: URL) =>
  secureOrigin(url) ? "__Host-chebot_login" : "chebot_login";

function secretKey(env: Pick<Env, "SESSION_SECRET">): Uint8Array {
  const secret = env.SESSION_SECRET?.trim() ?? "";
  if (secret.length < 32)
    throw new Error("SESSION_SECRET is not set, or shorter than 32 characters.");
  return new TextEncoder().encode(secret);
}

/** A Set-Cookie value: httpOnly, SameSite=Lax, Path=/, and Secure where the origin allows it. */
export function cookie(url: URL, name: string, value: string, maxAge: number): string {
  const secure = secureOrigin(url) ? "; Secure" : "";
  return `${name}=${value}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Lax${secure}`;
}

/** The value of a cookie of the request, or null. */
export function readCookie(request: Request, name: string): string | null {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const at = part.indexOf("=");
    if (at > 0 && part.slice(0, at).trim() === name) return part.slice(at + 1).trim();
  }
  return null;
}

async function sign(
  env: Pick<Env, "SESSION_SECRET">,
  audience: string,
  claims: JWTPayload,
  seconds: number,
): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(`${seconds}s`)
    .sign(secretKey(env));
}

/** The claims of a token of ours, or null when it is not one: tampered, expired, of another kind. */
async function verify(
  env: Pick<Env, "SESSION_SECRET">,
  audience: string,
  token: string | null,
): Promise<JWTPayload | null> {
  if (!token) return null;
  const key = secretKey(env);
  try {
    const { payload } = await jwtVerify(token, key, {
      audience,
      algorithms: ["HS256"],
      requiredClaims: ["exp"],
    });
    return payload;
  } catch {
    return null;
  }
}

/** The Set-Cookie of a new session for `user`. */
export async function sessionCookie(
  url: URL,
  env: Pick<Env, "SESSION_SECRET">,
  user: Omit<User, "kind">,
): Promise<string> {
  const token = await sign(
    env,
    SESSION_AUDIENCE,
    { sub: user.userId, name: user.name, roles: user.roles },
    SESSION_SECONDS,
  );
  return cookie(url, sessionCookieName(url), token, SESSION_SECONDS);
}

export const clearSessionCookie = (url: URL) => cookie(url, sessionCookieName(url), "", 0);

/**
 * The caller of a request: the user of a valid session cookie, and anonymous for anything else (no
 * cookie, or one that is tampered, expired or signed with another secret).
 */
export async function sessionIdentity(
  request: Request,
  env: Pick<Env, "SESSION_SECRET">,
): Promise<Identity> {
  const url = new URL(request.url);
  const claims = await verify(env, SESSION_AUDIENCE, readCookie(request, sessionCookieName(url)));
  if (!claims || typeof claims.sub !== "string" || !claims.sub) return { kind: "anonymous" };
  const roles = Array.isArray(claims.roles)
    ? claims.roles.filter((r): r is string => typeof r === "string")
    : [];
  const name = typeof claims.name === "string" && claims.name ? claims.name : claims.sub;
  return { kind: "user", userId: claims.sub, name, roles };
}

/** What /auth/callback needs of the sign-in that /auth/login started. */
export interface PendingLogin {
  state: string;
  nonce: string;
  verifier: string;
  /** A path of this origin. */
  returnTo: string;
}

export async function loginCookie(
  url: URL,
  env: Pick<Env, "SESSION_SECRET">,
  login: PendingLogin,
): Promise<string> {
  const token = await sign(env, LOGIN_AUDIENCE, { ...login }, LOGIN_SECONDS);
  return cookie(url, loginCookieName(url), token, LOGIN_SECONDS);
}

export const clearLoginCookie = (url: URL) => cookie(url, loginCookieName(url), "", 0);

/** The sign-in this browser started, or null. */
export async function pendingLogin(
  request: Request,
  env: Pick<Env, "SESSION_SECRET">,
): Promise<PendingLogin | null> {
  const url = new URL(request.url);
  const claims = await verify(env, LOGIN_AUDIENCE, readCookie(request, loginCookieName(url)));
  if (!claims) return null;
  const { state, nonce, verifier, returnTo } = claims;
  if (typeof state !== "string" || typeof nonce !== "string" || typeof verifier !== "string")
    return null;
  return { state, nonce, verifier, returnTo: typeof returnTo === "string" ? returnTo : "/" };
}

/**
 * Whether a request comes from a page of this origin. The session is a cookie, which a browser
 * sends with a request from any site: a request that changes something must prove it comes from
 * here. Browsers send Origin with every POST, PUT and DELETE, and Sec-Fetch-Site with every
 * request; a request with neither (not from a browser) is refused too.
 */
export function fromThisOrigin(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site !== null && site !== "same-origin") return false;
  const origin = request.headers.get("origin");
  if (origin !== null) return origin === new URL(request.url).origin;
  return site === "same-origin";
}
