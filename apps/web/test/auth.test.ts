import { runDurableObjectAlarm } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { generateKeyPair, jwtVerify, SignJWT } from "jose";
import { afterEach, describe, expect, test, vi } from "vitest";
import { auth0Host, auth0Jwks, rolesOf, safeReturnTo } from "../src/worker/auth0.ts";
import { SESSION_SECONDS, sessionCookie } from "../src/worker/session.ts";
import {
  api,
  ask,
  cookiesOf,
  fakes,
  fakeTenant,
  LOGIN_COOKIE,
  ORIGIN,
  paying,
  quoted,
  SESSION_COOKIE,
  send,
  signInThrough,
  type TenantUser,
  withSession,
} from "./helpers.ts";

// The sign-in of auth0.ts against a fake tenant (its token endpoint and its keys), and the session
// cookie of session.ts that every route reads.

const ROLES = "https://che.bot/roles";
const user = (
  claims: TenantUser["claims"] = {},
  rest: Omit<TenantUser, "sub" | "claims"> = {},
) => ({
  sub: `auth0|${crypto.randomUUID()}`,
  claims,
  ...rest,
});

type Me = { id: string; name: string; admin: boolean; mayAsk: boolean } | null;
const me = async (headers: Record<string, string> = {}) =>
  (await (await api("/api/me", { headers })).json()) as Me;

/** A session token of ours, signed with `secret`, as session.ts writes them. */
const forged = (claims: Record<string, unknown>, options: { secret?: string; exp?: string } = {}) =>
  new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setAudience("chebot:session")
    .setIssuedAt()
    .setExpirationTime(options.exp ?? "1h")
    .sign(new TextEncoder().encode(options.secret ?? env.SESSION_SECRET));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("signing in", () => {
  test("/auth/login sends the browser to the tenant with state, nonce and PKCE, kept in a signed cookie", async () => {
    fakes();
    await fakeTenant();
    const first = await api("/auth/login?returnTo=%2Fr%2Fabc");
    expect(first.status).toBe(302);
    const location = new URL(first.headers.get("location") ?? "");
    expect(`${location.origin}${location.pathname}`).toBe(`https://${env.AUTH0_DOMAIN}/authorize`);
    const q = location.searchParams;
    expect(q.get("response_type")).toBe("code");
    expect(q.get("client_id")).toBe(env.AUTH0_CLIENT_ID);
    expect(q.get("redirect_uri")).toBe(`${ORIGIN}/auth/callback`);
    expect(q.get("scope")).toBe("openid profile email");
    expect(q.get("code_challenge_method")).toBe("S256");
    expect(q.get("code_challenge")).toMatch(/^[\w-]{43}$/);
    expect(q.get("state")).toMatch(/^[\w-]{43}$/);
    expect(q.get("nonce")).toMatch(/^[\w-]{43}$/);
    expect(q.has("audience")).toBe(false);

    const cookie = cookiesOf(first).get(LOGIN_COOKIE);
    expect(cookie?.attributes).toBe("Max-Age=600; Path=/; HttpOnly; SameSite=Lax; Secure");
    // signed, and carrying neither the secret nor the challenge in the clear of the URL
    const { payload } = await jwtVerify(
      cookie?.value ?? "",
      new TextEncoder().encode(env.SESSION_SECRET),
      { audience: "chebot:login" },
    );
    expect(payload).toMatchObject({
      state: q.get("state"),
      nonce: q.get("nonce"),
      returnTo: "/r/abc",
    });
    expect(payload.verifier).not.toBe(q.get("code_challenge"));

    const second = new URL((await api("/auth/login")).headers.get("location") ?? "").searchParams;
    for (const key of ["state", "nonce", "code_challenge"])
      expect(second.get(key), key).not.toBe(q.get(key));
  });

  test("a good callback sets the session; /api/me answers the user with the roles of the claims", async () => {
    fakes();
    const tenant = await fakeTenant();
    const ana = user({ name: "Ana Pérez", email: "ana@example.com", [ROLES]: ["Contrib"] });
    const { callback, session } = await signInThrough(tenant, ana, { returnTo: "/r/abc?x=1" });
    expect(callback.status).toBe(302);
    expect(callback.headers.get("location")).toBe("/r/abc?x=1");
    const cookies = cookiesOf(callback);
    expect(cookies.get(SESSION_COOKIE)?.attributes).toBe(
      `Max-Age=${SESSION_SECONDS}; Path=/; HttpOnly; SameSite=Lax; Secure`,
    );
    expect(cookies.get(LOGIN_COOKIE)?.attributes).toMatch(/^Max-Age=0;/);
    expect(await me(withSession(session ?? ""))).toEqual({
      id: ana.sub,
      name: "Ana Pérez",
      admin: false,
      mayAsk: true,
    });
    expect(await me()).toBeNull();

    // The code was exchanged once, with the secret, the same redirect and the PKCE verifier.
    const [form] = tenant.exchanges;
    expect(form?.get("client_secret")).toBe(env.AUTH0_CLIENT_SECRET);
    expect(form?.get("redirect_uri")).toBe(`${ORIGIN}/auth/callback`);
    expect(form?.get("code_verifier")).toMatch(/^[\w-]{43}$/);
  });

  test("the roles of the access token count too; the name falls back to the email", async () => {
    fakes();
    const tenant = await fakeTenant();
    const admin = user({ email: "root@example.com" }, { access: { [ROLES]: ["Admin"] } });
    const { session } = await signInThrough(tenant, admin);
    expect(await me(withSession(session ?? ""))).toEqual({
      id: admin.sub,
      name: "root@example.com",
      admin: true,
      mayAsk: true,
    });
  });

  test("returnTo is kept only when it is a path of this origin", async () => {
    fakes();
    const tenant = await fakeTenant();
    for (const returnTo of [
      "https://evil.test/r/abc",
      "//evil.test/r/abc",
      "/\\evil.test",
      "/\t/evil.test",
      "/.//evil.test",
      "/a/..//evil.test",
      "/%2e//evil.test",
      "javascript:alert(1)",
      "r/abc",
    ]) {
      const { callback } = await signInThrough(tenant, user(), { returnTo });
      expect(callback.headers.get("location"), returnTo).toBe("/");
    }
    expect(safeReturnTo("/mis-preguntas#x", ORIGIN)).toBe("/mis-preguntas#x");
    expect(safeReturnTo(null, ORIGIN)).toBe("/");
  });

  test("the callback refuses a wrong state, nonce, signature, audience or issuer, and an expired token", async () => {
    fakes();
    const tenant = await fakeTenant();
    const { privateKey: otherKey } = await generateKeyPair("RS256");
    const cases: [string, TenantUser, Parameters<typeof signInThrough>[2]][] = [
      ["wrong state", user(), { tamper: (url) => url.searchParams.set("state", "forged") }],
      ["no state", user(), { tamper: (url) => url.searchParams.delete("state") }],
      ["no sign-in cookie", user(), { loginCookie: null }],
      ["a forged sign-in cookie", user(), { loginCookie: "a.b.c" }],
      ["a code of another sign-in", user(), { tamper: (url) => url.searchParams.set("code", "x") }],
      [
        "the tenant's error",
        user(),
        {
          tamper: (url) => {
            url.searchParams.delete("code");
            url.searchParams.set("error", "access_denied");
          },
        },
      ],
      ["wrong nonce", user({}, { idToken: { nonce: "forged" } }), {}],
      ["wrong signature", user({}, { idToken: { key: otherKey } }), {}],
      ["wrong audience", user({}, { idToken: { audience: "another-client" } }), {}],
      ["wrong issuer", user({}, { idToken: { issuer: "https://evil.auth0.com/" } }), {}],
      ["expired", user({}, { idToken: { expiresIn: "-1m" } }), {}],
    ];
    for (const [why, who, options] of cases) {
      const { callback, session } = await signInThrough(tenant, who, options);
      expect(callback.status, why).toBe(302);
      expect(callback.headers.get("location"), why).toBe("/?signin=failed");
      expect(session, why).toBeNull();
      expect(cookiesOf(callback).get(LOGIN_COOKIE)?.attributes, why).toMatch(/^Max-Age=0;/);
    }
  });

  test("/auth/logout clears the session and signs out of the tenant", async () => {
    fakes();
    const tenant = await fakeTenant();
    const { session } = await signInThrough(tenant, user({ [ROLES]: ["Contrib"] }));
    const out = await api("/auth/logout", { headers: withSession(session ?? "") });
    expect(out.status).toBe(302);
    const location = new URL(out.headers.get("location") ?? "");
    expect(`${location.origin}${location.pathname}`).toBe(`https://${env.AUTH0_DOMAIN}/v2/logout`);
    expect(location.searchParams.get("client_id")).toBe(env.AUTH0_CLIENT_ID);
    expect(location.searchParams.get("returnTo")).toBe(ORIGIN);
    const cleared = cookiesOf(out).get(SESSION_COOKIE);
    expect(cleared?.value).toBe("");
    expect(cleared?.attributes).toBe("Max-Age=0; Path=/; HttpOnly; SameSite=Lax; Secure");
    expect((await api("/auth/logout", { method: "POST" })).status).toBe(405);
    expect((await api("/auth/other")).status).toBe(404);
  });
});

describe("the session", () => {
  test("without a session nobody can ask, pay or delete; a run is readable by its link", async () => {
    fakes();
    await fakeTenant();
    const owner = `auth0|${crypto.randomUUID()}`;
    const { id } = await quoted(owner);
    const anonymous = [
      ["no cookie", {}],
      ["an empty cookie", withSession("")],
      ["not a token", withSession("abc.def.ghi")],
    ] as const;
    for (const [why, headers] of anonymous) {
      expect((await ask({ ...headers })).status, `ask, ${why}`).toBe(401);
      const paid = await api(`/api/runs/${id}/pay`, { method: "POST", headers: { ...headers } });
      expect(paid.status, `pay, ${why}`).toBe(401);
      const deleted = await api(`/api/runs/${id}`, { method: "DELETE", headers: { ...headers } });
      expect(deleted.status, `delete, ${why}`).toBe(401);
      expect((await api("/api/me/runs", { headers: { ...headers } })).status, why).toBe(401);
      const read = await api(`/api/runs/${id}`, { headers: { ...headers } });
      expect(read.status, `read, ${why}`).toBe(200);
      expect(((await read.json()) as { mine: boolean }).mine).toBe(false);
      expect((await api(`/api/runs/${id}/events`, { headers: { ...headers } })).status).toBe(200);
    }
  });

  test("a tampered, expired or wrongly signed cookie is not a user", async () => {
    fakes();
    const tenant = await fakeTenant();
    const { session, login } = await signInThrough(tenant, user({ [ROLES]: ["Admin"] }));
    const good = session ?? "";
    expect((await me(withSession(good)))?.admin).toBe(true);

    const [header, payload, signature] = good.split(".");
    const claims = JSON.parse(atob((payload ?? "").replace(/-/g, "+").replace(/_/g, "/")));
    const raised = btoa(JSON.stringify({ ...claims, sub: "auth0|someone-else", roles: ["Admin"] }))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const notUsers: [string, Record<string, string>][] = [
      ["another payload", withSession(`${header}.${raised}.${signature}`)],
      ["another signature", withSession(`${header}.${payload}.${signature?.slice(0, -2)}AA`)],
      ["unsigned", withSession(`${header}.${payload}.`)],
      ["expired", withSession(await forged({ sub: "auth0|x", roles: ["Admin"] }, { exp: "-1s" }))],
      [
        "another secret",
        withSession(await forged({ sub: "auth0|x", roles: ["Admin"] }, { secret: "x".repeat(48) })),
      ],
      ["the sign-in cookie", withSession(cookiesOf(login).get(LOGIN_COOKIE)?.value ?? "")],
      ["the name of http://localhost", { cookie: `chebot_session=${good}` }],
    ];
    for (const [why, headers] of notUsers) {
      expect(await me(headers), why).toBeNull();
      expect((await ask(headers)).status, why).toBe(401);
    }
  });

  test("a session lasts its fixed lifetime", async () => {
    fakes();
    await fakeTenant();
    const cookie = await sessionCookie(new URL(ORIGIN), env, {
      userId: "auth0|ana",
      name: "Ana",
      roles: ["Contrib"],
    });
    const token = /^[^=]+=([^;]+)/.exec(cookie)?.[1] ?? "";
    const { payload } = await jwtVerify(token, new TextEncoder().encode(env.SESSION_SECRET));
    expect((payload.exp ?? 0) - (payload.iat ?? 0)).toBe(SESSION_SECONDS);
    expect(SESSION_SECONDS).toBe(3 * 24 * 3600);
    // Plain http on this machine: no Secure flag, no __Host- prefix.
    const local = await sessionCookie(new URL("http://localhost:3000"), env, {
      userId: "auth0|ana",
      name: "Ana",
      roles: [],
    });
    expect(local).toMatch(
      /^chebot_session=[^;]+; Max-Age=259200; Path=\/; HttpOnly; SameSite=Lax$/,
    );
  });

  test("a valid session asks, lists its runs, pays and deletes; a stranger's session cannot", async () => {
    const { provider } = fakes();
    const tenant = await fakeTenant();
    const owner = withSession(
      (await signInThrough(tenant, user({ [ROLES]: ["Contrib"] }))).session ?? "",
    );
    const asked = await ask(owner);
    expect(asked.status).toBe(201);
    const { runId } = (await asked.json()) as { runId: string };

    const stranger = withSession((await signInThrough(tenant, user())).session ?? "");
    expect((await api(`/api/runs/${runId}`, { headers: stranger })).status).toBe(200);
    expect((await ask(stranger)).status).toBe(403);
    expect(
      (await api(`/api/runs/${runId}/pay`, { method: "POST", headers: stranger })).status,
    ).toBe(403);
    expect((await api(`/api/runs/${runId}`, { method: "DELETE", headers: stranger })).status).toBe(
      403,
    );
    const mine = await api("/api/me/runs", { headers: owner });
    expect(((await mine.json()) as { runs: { id: string }[] }).runs.map((r) => r.id)).toEqual([
      runId,
    ]);
    const summary = await api(`/api/runs/${runId}`, { headers: owner });
    expect(((await summary.json()) as { mine: boolean }).mine).toBe(true);

    expect((await api(`/api/runs/${runId}/pay`, { method: "POST", headers: owner })).status).toBe(
      202,
    );
    expect((await api(`/api/runs/${runId}`, { method: "DELETE", headers: owner })).status).toBe(
      204,
    );
    expect((await api(`/api/runs/${runId}`)).status).toBe(404);
    expect(provider.calls).toEqual([]);
  });
});

describe("the roles", () => {
  test('"Admin" is the admin and "Contrib" may ask; "admin" in lowercase is neither', async () => {
    fakes();
    const tenant = await fakeTenant();
    const signIn = async (roles: string[]) =>
      withSession((await signInThrough(tenant, user({ [ROLES]: roles }))).session ?? "");
    const admin = await signIn(["Admin"]);
    const contributor = await signIn(["Contrib"]);
    const lower = await signIn(["admin", "contrib", "ADMIN"]);

    expect(await me(admin)).toMatchObject({ admin: true, mayAsk: true });
    expect(await me(contributor)).toMatchObject({ admin: false, mayAsk: true });
    expect(await me(lower)).toMatchObject({ admin: false, mayAsk: false });

    expect((await ask(contributor)).status).toBe(201);
    expect((await ask(lower)).status).toBe(403);
    expect((await api("/api/admin/prices", { headers: admin })).status).toBe(200);
    expect((await api("/api/admin/prices", { headers: contributor })).status).toBe(403);
    expect((await api("/api/admin/prices", { headers: lower })).status).toBe(403);

    const { id } = await quoted(`auth0|${crypto.randomUUID()}`);
    expect((await api(`/api/runs/${id}`, { method: "DELETE", headers: lower })).status).toBe(403);
    expect((await api(`/api/runs/${id}`, { method: "DELETE", headers: admin })).status).toBe(204);
  });

  test("the roles come from every role claim, namespaced or not, exactly as issued", () => {
    expect(
      rolesOf({ sub: "x", [ROLES]: ["Admin", 3, "Contrib"], permissions: ["read:all"] }),
    ).toEqual(["Admin", "Contrib"]);
    expect(rolesOf({ roles: "Contrib" }, { "https://x/role": ["Admin"] }).sort()).toEqual([
      "Admin",
      "Contrib",
    ]);
    expect(rolesOf({ sub: "x", scope: "openid" })).toEqual([]);
  });
});

describe("the origin of a request that changes something", () => {
  test("a request from another site, or from no page at all, is refused; the pay hook is not", async () => {
    const { jobs } = fakes();
    const tenant = await fakeTenant();
    const session = withSession(
      (await signInThrough(tenant, user({ [ROLES]: ["Admin"] }))).session ?? "",
    );
    const body = JSON.stringify({ question: "¿Qué hora es en Tokio?" });
    const post = (headers: Record<string, string>) =>
      send("/api/runs", {
        method: "POST",
        headers: { ...session, "content-type": "application/json", ...headers },
        body,
      });
    expect((await post({ origin: "https://evil.test" })).status).toBe(403);
    expect((await post({ origin: "null" })).status).toBe(403);
    expect((await post({ origin: "http://chebot.test" })).status).toBe(403);
    expect((await post({ "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect((await post({ "sec-fetch-site": "same-site", origin: ORIGIN })).status).toBe(403);
    expect((await post({})).status).toBe(403);
    expect((await post({ origin: ORIGIN })).status).toBe(201);
    expect((await post({ "sec-fetch-site": "same-origin" })).status).toBe(201);

    const { id } = await quoted(`auth0|${crypto.randomUUID()}`);
    const evil = { ...session, origin: "https://evil.test" };
    expect((await send(`/api/runs/${id}`, { method: "DELETE", headers: evil })).status).toBe(403);
    expect((await send(`/api/runs/${id}/pay`, { method: "POST", headers: evil })).status).toBe(403);
    expect(
      (await send("/api/admin/prices", { method: "PUT", headers: evil, body: "{}" })).status,
    ).toBe(403);
    expect((await send(`/api/runs/${id}`, { headers: evil })).status).toBe(200);

    // The jobs service calls the hook with the run's token, no Origin and no cookie.
    const run = await paying(`auth0|${crypto.randomUUID()}`);
    expect(await runDurableObjectAlarm(run.stub)).toBe(true);
    expect((await jobs.pay(run.id)).status).toBe(200);
    expect(((await (await api(`/api/runs/${run.id}`)).json()) as { status: string }).status).toBe(
      "running",
    );
  });
});

describe("the tenant's keys", () => {
  test("are read from the tenant's JWKS once and cached", async () => {
    fakes();
    const tenant = await fakeTenant();
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => Response.json({ keys: [tenant.jwk] }));
    const tenantEnv = { ...env, AUTH0_DOMAIN: `https://cache-${crypto.randomUUID()}.auth0.test/` };
    const jwks = auth0Jwks(tenantEnv);
    expect(auth0Jwks(tenantEnv)).toBe(jwks);
    const issuer = `https://${auth0Host(tenantEnv.AUTH0_DOMAIN)}/`;
    for (const sub of ["auth0|a", "auth0|b"]) {
      const token = await tenant.token(sub, {}, { issuer });
      const { payload } = await jwtVerify(token, jwks, { issuer, audience: env.AUTH0_CLIENT_ID });
      expect(payload.sub).toBe(sub);
    }
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0]?.[0])).toBe(`${issuer}.well-known/jwks.json`);
  });
});
