import type { APIRequestContext, Page } from "@playwright/test";
import { esAR as t } from "../src/app/i18n/es-AR.ts";
import { CHART_QUESTION } from "../src/local/chart-scenario.ts";
import { MARKERS, SCENARIO_QUESTION } from "../src/local/scenario.ts";
import { BASE_URL } from "./base-url.ts";

export { CHART_QUESTION, MARKERS, SCENARIO_QUESTION, t };

/** The scripted question, made unique (a run of the local mode keys some fakes by the question). */
export const uniqueQuestion = (marker = "") =>
  `${marker ? `${marker} ` : ""}${SCENARIO_QUESTION} (${crypto.randomUUID().slice(0, 8)})`;

export interface TestUser {
  id: string;
  name: string;
  roles: string[];
}

/** A user of its own for each test (the local rate limit counts questions per user). */
export function newUser(roles: string[] = ["Contrib"]): TestUser {
  return { id: `local|e2e-${crypto.randomUUID()}`, name: "Prueba", roles };
}

/** The Origin a browser sends with a request of the app that changes something. */
export const fromApp = { origin: BASE_URL };

/**
 * Signs `user` in through the local sign-in: the session cookie goes to the cookie jar of
 * `request` (`page.request` shares the page's).
 */
export async function signInAs(request: APIRequestContext, user: TestUser) {
  const response = await request.post("/api/local/sign-in", { headers: fromApp, data: user });
  if (!response.ok()) throw new Error(`the local sign-in answered ${response.status()}`);
}

/** Signs `user` in on `page`, before its first page loads. */
export async function signIn(page: Page, user: TestUser) {
  await signInAs(page.request, user);
}

/** Asks through the page and lands on the run page; returns the run id. */
export async function ask(page: Page, question = SCENARIO_QUESTION): Promise<string> {
  await page.goto("/new");
  await page.getByLabel(t.ask.label).fill(question);
  await page.getByRole("button", { name: t.ask.submit }).click();
  await page.waitForURL(/\/r\/[0-9a-f-]{36}$/);
  return page.url().split("/r/")[1] ?? "";
}

/** The admin of each cookie jar that `finishedRun` signs in: one, whatever runs at once on it. */
const admins = new WeakMap<APIRequestContext, Promise<void>>();

/**
 * An admin run through the API, to its end: no payment. `request` is signed in as an admin of its
 * own.
 */
export async function finishedRun(
  request: APIRequestContext,
  question = SCENARIO_QUESTION,
): Promise<string> {
  let admin = admins.get(request);
  if (!admin) {
    admin = signInAs(request, newUser(["Admin"]));
    admins.set(request, admin);
  }
  await admin;
  const quote = await request.post("/api/runs", {
    headers: fromApp,
    data: { question },
  });
  const { runId } = (await quote.json()) as { runId: string };
  await request.post(`/api/runs/${runId}/pay`, { headers: fromApp });
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
