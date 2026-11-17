import type { APIRequestContext, Page } from "@playwright/test";
import { esAR as t } from "../src/app/i18n/es-AR.ts";
import { LOCAL_MODE_MARKER } from "../src/local/marker.ts";
import { SCENARIO_QUESTION } from "../src/local/scenario.ts";
import { localToken } from "../src/local/token.ts";

export { SCENARIO_QUESTION, t };

export interface TestUser {
  id: string;
  name: string;
  roles: string[];
}

/** A user of its own for each test (the local rate limit counts questions per user). */
export function newUser(roles: string[] = ["beta"]): TestUser {
  return { id: `local|e2e-${crypto.randomUUID()}`, name: "Prueba", roles };
}

/** Signs `user` in the way the local sign-in does, before the first page loads. */
export async function signIn(page: Page, user: TestUser) {
  await page.addInitScript(
    ([key, value]) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, value);
    },
    [`${LOCAL_MODE_MARKER}:user`, JSON.stringify(user)] as const,
  );
}

export const authHeader = (user: TestUser) => ({
  authorization: `Bearer ${localToken({ sub: user.id, roles: user.roles })}`,
});

/** Asks through the page and lands on the run page; returns the run id. */
export async function ask(page: Page, question = SCENARIO_QUESTION): Promise<string> {
  await page.goto("/");
  await page.getByLabel(t.ask.label).fill(question);
  await page.getByRole("button", { name: t.ask.submit }).click();
  await page.waitForURL(/\/r\/[0-9a-f-]{36}$/);
  return page.url().split("/r/")[1] ?? "";
}

/** An admin run through the API, to its end: no payment. */
export async function finishedRun(request: APIRequestContext): Promise<string> {
  const admin = newUser(["admin"]);
  const quote = await request.post("/api/runs", {
    headers: authHeader(admin),
    data: { question: SCENARIO_QUESTION },
  });
  const { runId } = (await quote.json()) as { runId: string };
  await request.post(`/api/runs/${runId}/pay`, { headers: authHeader(admin) });
  for (let i = 0; i < 120; i++) {
    const summary = (await (await request.get(`/api/runs/${runId}`)).json()) as {
      status: string;
    };
    if (summary.status === "completed") return runId;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`run ${runId} did not complete`);
}

/** The stage line once the run is done. */
export const DONE = /^Listo\./;
