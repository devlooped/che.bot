import { runDurableObjectAlarm } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { CATALOG, script } from "@chebot/driver/testing";
import type { ConfigOverrides, LoggedEvent } from "@chebot/protocol";
import { type CatalogModel, FakeProvider, type FakeScript } from "@chebot/providers";
import { onTestFinished } from "vitest";
import { runStub } from "../src/worker/api.ts";
import { overrideDeps } from "../src/worker/deps.ts";
import type { IdentityResolver } from "../src/worker/identity.ts";

export const QUESTION = "¿Cuál es la capital de Australia y cuánta gente vive ahí?";

/**
 * The stand-in for the Auth0 check: the user of the x-test-user header, with the roles of
 * x-test-roles; anonymous without it.
 */
export const testIdentity: IdentityResolver = async (request) => {
  const userId = request.headers.get("x-test-user");
  if (!userId) return { kind: "anonymous" };
  const roles = request.headers.get("x-test-roles");
  return { kind: "user", userId, roles: roles ? roles.split(",") : [] };
};

export function as(userId: string, roles: string[] = []): Record<string, string> {
  return { "x-test-user": userId, ...(roles.length ? { "x-test-roles": roles.join(",") } : {}) };
}

/**
 * Replaces the outside world for one test: a scripted FakeProvider, a fixed catalog, the test
 * identity, and alarms that never fire by themselves (the test runs each tick).
 */
export function fakes(
  options: { calls?: FakeScript["calls"]; config?: ConfigOverrides; catalog?: CatalogModel[] } = {},
) {
  const provider = new FakeProvider(script(options.calls));
  const catalog = options.catalog ?? CATALOG;
  const restore = overrideDeps({
    provider: () => provider,
    catalog: async () => catalog,
    identify: testIdentity,
    runConfig: () => options.config ?? {},
    tickDelayMs: 3_600_000,
  });
  // D1 keeps its rows from one test to the next in a file: the settings of a test go with it.
  onTestFinished(async () => {
    restore();
    await env.DB.prepare("DELETE FROM model_settings").run();
  });
  return { provider, catalog };
}

export async function quoted(owner = "user-1", id: string = crypto.randomUUID()) {
  const stub = runStub(env, id);
  await stub.quote({
    id,
    owner,
    question: QUESTION,
    class: "complex",
    probability: 0.88,
    amount: 10000,
    currency: "ARS",
  });
  return { id, stub };
}

export async function paidRun(owner = "user-1") {
  const run = await quoted(owner);
  await run.stub.pay();
  await run.stub.paid();
  return run;
}

/** Runs the alarms of a run until none is scheduled; returns how many ran. */
export async function runAlarms(stub: DurableObjectStub, max = 60): Promise<number> {
  for (let n = 0; n < max; n++) if (!(await runDurableObjectAlarm(stub))) return n;
  throw new Error("the run did not end");
}

export function api(path: string, init: RequestInit = {}) {
  return exports.default.fetch(new Request(`https://chebot.test${path}`, init));
}

export async function eventsOf(stub: { events(after?: number): Promise<LoggedEvent[] | null> }) {
  return (await stub.events(0)) ?? [];
}
