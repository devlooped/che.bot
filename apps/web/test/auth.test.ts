import { env } from "cloudflare:workers";
import { generateKeyPair } from "jose";
import { afterEach, describe, expect, test, vi } from "vitest";
import { auth0Host, auth0Identity, auth0Jwks, rolesOf } from "../src/worker/auth0.ts";
import { api, ask, fakes, HOOK_URL, quoted, signer } from "./helpers.ts";

// The Auth0 check with real RS256 tokens, signed by a fake tenant whose keys replace the JWKS of
// AUTH0_DOMAIN.

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const ROLES = "https://che.bot/roles";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the access token", () => {
  test("a request without a valid token cannot ask, pay or delete", async () => {
    fakes();
    const tenant = await signer();
    const owner = `auth0|${crypto.randomUUID()}`;
    const { id } = await quoted(owner);
    const { privateKey: otherKey } = await generateKeyPair("RS256");
    const invalid = [
      ["no token", {}],
      ["not a bearer", { authorization: "Basic abc" }],
      ["not a JWT", bearer("abc.def.ghi")],
      ["wrong audience", bearer(await tenant.token(owner, {}, { audience: "https://other" }))],
      [
        "wrong issuer",
        bearer(await tenant.token(owner, {}, { issuer: "https://evil.auth0.com/" })),
      ],
      ["wrong signature", bearer(await tenant.token(owner, {}, { key: otherKey }))],
      ["expired", bearer(await tenant.token(owner, {}, { expiresIn: "-1m" }))],
    ] as const;
    for (const [why, headers] of invalid) {
      const asked = await ask({ ...headers });
      expect(asked.status, `ask, ${why}`).toBe(401);
      const paid = await api(`/api/runs/${id}/pay`, { method: "POST", headers: { ...headers } });
      expect(paid.status, `pay, ${why}`).toBe(401);
      const deleted = await api(`/api/runs/${id}`, { method: "DELETE", headers: { ...headers } });
      expect(deleted.status, `delete, ${why}`).toBe(401);
    }
    expect((await api(`/api/runs/${id}`)).status).toBe(200);
    expect((await api(`/api/runs/${id}/events`)).status).toBe(200);
  });

  test("a valid token signs the user in with the roles of its claim; a run is public by link", async () => {
    const { provider } = fakes();
    const tenant = await signer();
    const owner = `auth0|${crypto.randomUUID()}`;
    const token = await tenant.token(owner, { [ROLES]: ["beta"] });
    const asked = await ask(bearer(token));
    expect(asked.status).toBe(201);
    const { runId } = (await asked.json()) as { runId: string };

    // Anyone reads it by its link, signed in or not; a token with no role may not ask.
    expect((await api(`/api/runs/${runId}`)).status).toBe(200);
    const stranger = await tenant.token(`auth0|${crypto.randomUUID()}`);
    expect((await api(`/api/runs/${runId}`, { headers: bearer(stranger) })).status).toBe(200);
    expect((await ask(bearer(stranger))).status).toBe(403);
    expect(
      (await api(`/api/runs/${runId}/pay`, { method: "POST", headers: bearer(stranger) })).status,
    ).toBe(403);
    const mine = await api("/api/me/runs", { headers: bearer(token) });
    expect(((await mine.json()) as { runs: { id: string }[] }).runs.map((r) => r.id)).toEqual([
      runId,
    ]);

    expect(
      (await api(`/api/runs/${runId}/pay`, { method: "POST", headers: bearer(token) })).status,
    ).toBe(202);
    expect(
      (await api(`/api/runs/${runId}`, { method: "DELETE", headers: bearer(token) })).status,
    ).toBe(204);
    expect((await api(`/api/runs/${runId}`)).status).toBe(404);
    expect(provider.calls).toEqual([]);
  });

  test("an admin token deletes another user's run", async () => {
    fakes();
    const tenant = await signer();
    const { id } = await quoted(`auth0|${crypto.randomUUID()}`);
    const admin = await tenant.token("auth0|admin", { [ROLES]: ["admin"] });
    expect(
      (await api(`/api/runs/${id}`, { method: "DELETE", headers: bearer(admin) })).status,
    ).toBe(204);
  });

  test("the roles come from every role claim, namespaced or not", () => {
    expect(rolesOf({ sub: "x", [ROLES]: ["admin", 3, "beta"], permissions: ["read:all"] })).toEqual(
      ["admin", "beta"],
    );
    expect(rolesOf({ roles: "beta", "https://x/role": ["admin"] }).sort()).toEqual([
      "admin",
      "beta",
    ]);
    expect(rolesOf({ sub: "x", scope: "openid" })).toEqual([]);
  });

  test("the keys are read from the tenant's JWKS once and cached", async () => {
    fakes();
    const tenant = await signer();
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => Response.json({ keys: [tenant.jwk] }));
    const tenantEnv = { ...env, AUTH0_DOMAIN: `https://cache-${crypto.randomUUID()}.auth0.test/` };
    const jwks = auth0Jwks(tenantEnv);
    expect(auth0Jwks(tenantEnv)).toBe(jwks);
    const issuer = `https://${auth0Host(tenantEnv.AUTH0_DOMAIN)}/`;
    for (const user of ["auth0|a", "auth0|b"]) {
      const token = await tenant.token(user, { [ROLES]: ["beta"] }, { issuer });
      const identity = await auth0Identity(
        new Request(HOOK_URL, { headers: bearer(token) }),
        tenantEnv,
        jwks,
      );
      expect(identity).toEqual({ kind: "user", userId: user, roles: ["beta"] });
    }
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0]?.[0])).toBe(`${issuer}.well-known/jwks.json`);
  });
});
