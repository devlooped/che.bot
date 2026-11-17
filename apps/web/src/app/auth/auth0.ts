import { type Auth0Client, createAuth0Client } from "@auth0/auth0-spa-js";
import { type Auth, type AuthUser, claimsOf, rolesOf } from "./types.ts";

// Sign-in with the Auth0 SPA SDK. The tenant, the application and the API come from public build
// variables (VITE_AUTH0_DOMAIN, VITE_AUTH0_CLIENT_ID, VITE_AUTH0_AUDIENCE); the access token goes
// to the Worker, which verifies it against the tenant's keys (src/worker/auth0.ts).

interface AppState {
  returnTo?: string;
}

export function auth0Config() {
  const env = import.meta.env;
  return {
    domain: (env.VITE_AUTH0_DOMAIN ?? "").trim(),
    clientId: (env.VITE_AUTH0_CLIENT_ID ?? "").trim(),
    audience: (env.VITE_AUTH0_AUDIENCE ?? "").trim(),
  };
}

export function createAuth(): Auth {
  const config = auth0Config();
  let client: Promise<Auth0Client> | null = null;
  const get = () => {
    if (!config.domain || !config.clientId || !config.audience)
      return Promise.reject(new Error("The Auth0 build variables are not set."));
    client ??= createAuth0Client({
      domain: config.domain,
      clientId: config.clientId,
      authorizationParams: { audience: config.audience, redirect_uri: window.location.origin },
      cacheLocation: "localstorage",
      useRefreshTokens: true,
    });
    return client;
  };

  async function user(c: Auth0Client): Promise<AuthUser | null> {
    if (!(await c.isAuthenticated())) return null;
    const profile = await c.getUser();
    const token = await c.getTokenSilently().catch(() => null);
    if (!profile?.sub) return null;
    return {
      id: profile.sub,
      name: profile.given_name ?? profile.name ?? profile.email ?? profile.sub,
      roles: token ? rolesOf(claimsOf(token)) : rolesOf(profile),
    };
  }

  return {
    async init() {
      const c = await get().catch(() => null);
      if (!c) return null;
      const params = new URLSearchParams(window.location.search);
      if (params.has("code") && params.has("state")) {
        const { appState } = await c.handleRedirectCallback<AppState>();
        window.history.replaceState(null, "", appState?.returnTo ?? "/");
      }
      return user(c);
    },
    async signIn(returnTo) {
      const c = await get();
      await c.loginWithRedirect<AppState>({ appState: { returnTo } });
    },
    async signOut() {
      const c = await get();
      await c.logout({ logoutParams: { returnTo: window.location.origin } });
    },
    async token() {
      const c = await get().catch(() => null);
      if (!c || !(await c.isAuthenticated())) return null;
      return (await c.getTokenSilently()) ?? null;
    },
  };
}
