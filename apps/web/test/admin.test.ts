import { env } from "cloudflare:workers";
import { CATALOG, catalogEntry } from "@chebot/driver/testing";
import { describe, expect, test } from "vitest";
import { resolveRunModels } from "../src/worker/settings.ts";
import { api, as, ask, contrib, fakes } from "./helpers.ts";

const admin = () => as(`admin-${crypto.randomUUID()}`, ["Admin"]);
const put = (path: string, headers: Record<string, string>, body: unknown) =>
  api(path, { method: "PUT", headers, body: JSON.stringify(body) });

interface ModelsBody {
  roles: { role: string; kind: string; default: unknown; setting: unknown }[];
  families: { family: string; kind: string; latest: string; efforts: string[] }[];
}

describe("the admin API", () => {
  test("only an admin reads or writes the models and the prices", async () => {
    fakes();
    for (const path of ["/api/admin/models", "/api/admin/prices"]) {
      expect((await api(path)).status).toBe(401);
      expect((await api(path, { headers: contrib("user-b") })).status).toBe(403);
      expect((await put(path, contrib("user-b"), {})).status).toBe(403);
      expect((await api(path, { headers: admin() })).status).toBe(200);
      expect((await api(path, { method: "POST", headers: admin() })).status).toBe(405);
    }
  });

  test("the roles with their defaults, and the families offered from the catalog", async () => {
    fakes({
      catalog: [
        ...CATALOG,
        { ...catalogEntry("anthropic/claude-sonnet-5.5"), efforts: ["low", "high"] },
        catalogEntry("anthropic/claude-sonnet-5.4"),
        catalogEntry("openai/text-embedding-9", "embedding"),
      ],
    });
    const body = (await (
      await api("/api/admin/models", { headers: admin() })
    ).json()) as ModelsBody;
    expect(body.roles.map((r) => r.role)).toEqual([
      "panel.grok",
      "panel.claude",
      "panel.openai",
      "panel.gemini",
      "utility",
      "classifier",
    ]);
    expect(body.roles[1]).toEqual({
      role: "panel.claude",
      kind: "language",
      default: { family: "anthropic/opus", effort: "medium" },
      setting: null,
    });
    expect(body.families.find((f) => f.family === "anthropic/sonnet")).toEqual({
      family: "anthropic/sonnet",
      kind: "language",
      latest: "anthropic/claude-sonnet-5.5",
      efforts: ["low", "high"],
    });
    expect(body.families.find((f) => f.kind === "decision")).toMatchObject({
      family: "typesafe-ai/jev",
    });
    expect(body.families.some((f) => f.kind === "embedding")).toBe(false);
  });

  test("a valid setting is stored as a family and used by the next run; an unknown role, family or effort is refused", async () => {
    const catalog = [...CATALOG, catalogEntry("anthropic/claude-sonnet-5.5")];
    fakes({ catalog });
    const headers = admin();
    const refused = [
      [{ "panel.mistral": { family: "anthropic/opus", effort: "high" } }, "panel.mistral"],
      [{ "panel.claude": { family: "anthropic/nonexistent", effort: "high" } }, "panel.claude"],
      [{ "panel.claude": { family: "anthropic/opus", effort: "turbo" } }, "panel.claude"],
      [{ "panel.claude": { family: "opus", effort: null } }, "panel.claude"],
      [{ classifier: { family: "typesafe-ai/jev", effort: "high" } }, "classifier"],
      [{ classifier: { family: "anthropic/opus", effort: null } }, "classifier"],
      [{ utility: { family: "typesafe-ai/jev", effort: null } }, "utility"],
    ] as const;
    for (const [settings, role] of refused) {
      const response = await put("/api/admin/models", headers, {
        settings: { "panel.grok": { family: "spacexai/grok", effort: "medium" }, ...settings },
      });
      expect(response.status, JSON.stringify(settings)).toBe(400);
      const { errors } = (await response.json()) as { errors: Record<string, string> };
      expect(Object.keys(errors)).toEqual([role]);
    }
    expect((await put("/api/admin/models", headers, { settings: [] })).status).toBe(400);
    const rows = await env.DB.prepare("SELECT role FROM model_settings").all();
    expect(rows.results).toEqual([]); // a refused body changes nothing

    const saved = await put("/api/admin/models", headers, {
      settings: {
        "panel.claude": { family: "anthropic/claude-sonnet-5.4", effort: "high" },
        "panel.grok": { family: "spacexai/grok", effort: "medium" },
      },
    });
    expect(saved.status).toBe(200);
    const body = (await saved.json()) as ModelsBody;
    expect(body.roles.find((r) => r.role === "panel.claude")?.setting).toEqual({
      family: "anthropic/sonnet",
      effort: "high",
    });
    const row = await env.DB.prepare(
      "SELECT model_id, effort, updated_by FROM model_settings WHERE role = 'panel.claude'",
    ).first();
    expect(row).toEqual({
      model_id: "anthropic/sonnet",
      effort: "high",
      updated_by: expect.stringMatching(/^admin-/),
    });
    const models = await resolveRunModels(env);
    expect(models["panel.claude"]).toEqual({ id: "anthropic/claude-sonnet-5.5", effort: "high" });
    expect(models["panel.grok"]).toEqual({ id: "spacexai/grok-4.7", effort: "medium" });

    // Null puts a role back on its default.
    expect(
      (await put("/api/admin/models", headers, { settings: { "panel.claude": null } })).status,
    ).toBe(200);
    expect((await resolveRunModels(env))["panel.claude"]).toEqual({
      id: "anthropic/claude-opus-5.5",
      effort: "medium",
    });
  });

  test("a new price is used by the next quote; a bad price is refused", async () => {
    const { classifier } = fakes();
    const headers = admin();
    for (const prices of [{ cheap: 1 }, { simple: -5 }, { simple: "6000" }, { complex: 1e9 }]) {
      expect(
        (await put("/api/admin/prices", headers, { prices })).status,
        JSON.stringify(prices),
      ).toBe(400);
    }
    const saved = await put("/api/admin/prices", headers, { prices: { simple: 6500 } });
    expect(saved.status).toBe(200);
    expect(await saved.json()).toEqual({
      prices: [
        { class: "simple", amount: 6500, currency: "ARS" },
        { class: "complex", amount: 10000, currency: "ARS" },
      ],
    });
    classifier.choice = "simple";
    classifier.probability = 0.95;
    const quote = await ask(contrib(`user-${crypto.randomUUID()}`));
    expect(await quote.json()).toMatchObject({ class: "simple", amount: 6500, currency: "ARS" });
  });
});
