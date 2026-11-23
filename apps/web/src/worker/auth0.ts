import {
  base64url,
  createRemoteJWKSet,
  type JWTPayload,
  type JWTVerifyGetKey,
  jwtVerify,
} from "jose";
import { deps } from "./deps.ts";
import type { Env } from "./env.ts";
import {
  clearLoginCookie,
  clearSessionCookie,
  loginCookie,
  pendingLogin,
  sessionCookie,
} from "./session.ts";

// Sign-in on the server, with the authorization code flow of a regular web application of the
// Auth0 tenant (the application of the existing app, @auth0/nextjs-auth0):
//
//   GET /auth/login?returnTo=/path  redirects to the tenant's /authorize, with state, nonce and
//                                   PKCE (S256) kept in a signed sign-in cookie for 10 minutes
//   GET /auth/callback              checks the state, exchanges the code with the client secret and
//                                   the code verifier, verifies the ID token, and sets the session
//   GET /auth/logout                clears the session and signs out of the tenant
//
// A failed sign-in clears the sign-in cookie and goes back to /new?signin=failed, which the page to
// ask words beside its button to sign in.

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
 * namespaced claim such as `https://che.bot/roles` (set by a post-login Action of the tenant).
 */
const ROLE_CLAIM = /^(?:.*[/:.])?roles?$/i;

/** The roles of a token: every string of every role claim, merged, exactly as issued. */
export function rolesOf(...payloads: JWTPayload[]): string[] {
  const roles = new Set<string>();
  for (const payload of payloads)
    for (const [key, value] of Object.entries(payload)) {
      if (!ROLE_CLAIM.test(key)) continue;
      const values = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
      for (const role of values) if (typeof role === "string") roles.add(role);
    }
  return [...roles];
}

/**
 * `returnTo` when it is a path of this origin, "/" for anything else. The path is checked after
 * the URL parser normalized it: "/.//evil.test" becomes "//evil.test", which a browser would read
 * as another host.
 */
export function safeReturnTo(returnTo: string | null, origin: string): string {
  if (!returnTo?.startsWith("/") || returnTo.includes("\\")) return "/";
  try {
    const url = new URL(returnTo, origin);
    const path = `${url.pathname}${url.search}${url.hash}`;
    return url.origin === origin && /^\/(?![/\\])/.test(path) ? path : "/";
  } catch {
    return "/";
  }
}

const randomToken = () => base64url.encode(crypto.getRandomValues(new Uint8Array(32)));

async function challengeOf(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url.encode(new Uint8Array(digest));
}

const callbackUrl = (url: URL) => `${url.origin}/auth/callback`;

function clientId(env: Pick<Env, "AUTH0_CLIENT_ID">): string {
  const id = env.AUTH0_CLIENT_ID?.trim();
  if (!id) throw new Error("AUTH0_CLIENT_ID is not set.");
  return id;
}

function redirect(location: string, cookies: string[] = []): Response {
  const headers = new Headers({ location, "cache-control": "no-store" });
  for (const value of cookies) headers.append("set-cookie", value);
  return new Response(null, { status: 302, headers });
}

/** GET /auth/login: to the tenant's sign-in page. */
async function login(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const state = randomToken();
  const nonce = randomToken();
  const verifier = randomToken();
  const returnTo = safeReturnTo(url.searchParams.get("returnTo"), url.origin);
  const authorize = new URL(`https://${auth0Host(env.AUTH0_DOMAIN)}/authorize`);
  authorize.search = new URLSearchParams({
    response_type: "code",
    client_id: clientId(env),
    redirect_uri: callbackUrl(url),
    scope: "openid profile email",
    state,
    nonce,
    code_challenge: await challengeOf(verifier),
    code_challenge_method: "S256",
  }).toString();
  return redirect(authorize.href, [
    await loginCookie(url, env, { state, nonce, verifier, returnTo }),
  ]);
}

interface TokenResponse {
  id_token?: unknown;
  access_token?: unknown;
}

/** The user of a code: exchanged at the tenant, its ID token verified. Throws on any doubt. */
async function userOfCode(
  url: URL,
  env: Env,
  code: string,
  expected: { nonce: string; verifier: string },
) {
  const host = auth0Host(env.AUTH0_DOMAIN);
  const client = clientId(env);
  const secret = env.AUTH0_CLIENT_SECRET?.trim();
  if (!secret) throw new Error("AUTH0_CLIENT_SECRET is not set.");
  const response = await deps.auth0Fetch(
    new Request(`https://${host}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: client,
        client_secret: secret,
        code,
        redirect_uri: callbackUrl(url),
        code_verifier: expected.verifier,
      }),
    }),
  );
  if (!response.ok) throw new Error(`The token endpoint answered ${response.status}.`);
  const tokens = (await response.json()) as TokenResponse;
  if (typeof tokens.id_token !== "string") throw new Error("The tenant sent no ID token.");

  const jwks = deps.jwks(env);
  const issuer = auth0Issuer(env.AUTH0_DOMAIN);
  const { payload } = await jwtVerify(tokens.id_token, jwks, {
    issuer,
    audience: client,
    algorithms: ["RS256"],
    requiredClaims: ["sub", "exp", "iat", "nonce"],
  });
  if (payload.nonce !== expected.nonce) throw new Error("The nonce of the ID token is not ours.");
  if (Array.isArray(payload.aud) && payload.aud.length > 1 && payload.azp !== client)
    throw new Error("The ID token was issued to another party.");
  if (!payload.sub) throw new Error("The ID token has no subject.");

  // The access token adds its roles when it is a JWT of the tenant (an opaque one has none).
  const sources = [payload];
  if (typeof tokens.access_token === "string" && tokens.access_token.split(".").length === 3) {
    const access = await jwtVerify(tokens.access_token, jwks, { issuer, algorithms: ["RS256"] })
      .then((r) => r.payload)
      .catch(() => null);
    if (access) sources.push(access);
  }
  const text = (value: unknown) =>
    typeof value === "string" && value.trim() ? value.trim() : null;
  return {
    userId: payload.sub,
    name: text(payload.name) ?? text(payload.email) ?? payload.sub,
    roles: rolesOf(...sources),
  };
}

/** GET /auth/callback: the tenant sends the browser back with a code, or an error. */
async function callback(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const failed = (why: string) => {
    console.warn(`Sign-in failed: ${why}`);
    return redirect("/new?signin=failed", [clearLoginCookie(url)]);
  };
  const login = await pendingLogin(request, env);
  if (!login) return failed("no sign-in was started here, or it expired.");
  const state = url.searchParams.get("state");
  if (!state || state !== login.state) return failed("the state is not ours.");
  const error = url.searchParams.get("error");
  if (error) return failed(`the tenant answered ${error}.`);
  const code = url.searchParams.get("code");
  if (!code) return failed("no code.");
  let user: Awaited<ReturnType<typeof userOfCode>>;
  try {
    user = await userOfCode(url, env, code, login);
  } catch (e) {
    return failed(e instanceof Error ? e.message : String(e));
  }
  return redirect(safeReturnTo(login.returnTo, url.origin), [
    clearLoginCookie(url),
    await sessionCookie(url, env, user),
  ]);
}

/** GET /auth/logout: the session ends here and at the tenant, which comes back to the origin. */
function logout(request: Request, env: Env): Response {
  const url = new URL(request.url);
  const tenant = new URL(`https://${auth0Host(env.AUTH0_DOMAIN)}/v2/logout`);
  tenant.search = new URLSearchParams({
    client_id: clientId(env),
    returnTo: url.origin,
  }).toString();
  return redirect(tenant.href, [clearSessionCookie(url), clearLoginCookie(url)]);
}

/** The routes under /auth/. */
export async function handleAuth(request: Request, env: Env): Promise<Response> {
  const { pathname } = new URL(request.url);
  const route =
    pathname === "/auth/login"
      ? login
      : pathname === "/auth/callback"
        ? callback
        : pathname === "/auth/logout"
          ? logout
          : null;
  if (!route) return new Response("Not found.", { status: 404 });
  if (request.method !== "GET") return new Response("Method not allowed.", { status: 405 });
  return route(request, env);
}
