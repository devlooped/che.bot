import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import {
  CHART_QUESTION,
  DONE,
  finishedRun,
  fromApp,
  newUser,
  signIn,
  t,
  uniqueQuestion,
} from "./helpers.ts";

// An automated accessibility check (axe) of the main pages and states, at both widths: WCAG 2.1
// A and AA, and axe's best practices (landmarks, heading order). Motion is reduced so that no
// sheet is caught in the middle of its entrance.

async function violations(page: Page): Promise<string[]> {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"])
    .analyze();
  return result.violations.map(
    (v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`,
  );
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("the ask page, signed out and signed in", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: t.ask.signInToAsk })).toBeVisible();
  expect(await violations(page)).toEqual([]);
  await signIn(page, newUser());
  await page.reload();
  await expect(page.getByLabel(t.ask.label)).toBeVisible();
  expect(await violations(page)).toEqual([]);
});

test("a finished answer, its discussion, and its history", async ({ page, request }) => {
  const runId = await finishedRun(request);
  await page.goto(`/r/${runId}`);
  await expect(page.getByTestId("stage-line")).toHaveText(DONE);
  expect(await violations(page)).toEqual([]);

  await page.locator("summary", { hasText: t.history.title }).click();
  await expect(page.getByRole("slider", { name: t.history.slider })).toBeVisible();
  await page.getByRole("button", { name: t.history.next }).click();
  expect(await violations(page)).toEqual([]);

  const mark = page.getByTestId("mark").first();
  await mark.focus();
  await page.keyboard.press("Enter");
  const sheet = page.getByRole("dialog", { name: t.discussion.title });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("button", { name: t.common.close })).toBeFocused();
  expect(await violations(page)).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(mark).toBeFocused();
});

test("the price, the QR and an expired payment", async ({ page }) => {
  await signIn(page, newUser());
  await page.goto("/");
  await page.getByLabel(t.ask.label).fill(uniqueQuestion());
  await page.getByRole("button", { name: t.ask.submit }).click();
  await expect(page.getByTestId("quote")).toBeVisible();
  expect(await violations(page)).toEqual([]);
  const price = t.money(10_000, "ARS");
  await page.getByRole("button", { name: t.quote.pay(price) }).click();
  await expect(page.getByRole("img", { name: t.payment.qrLabel(price) })).toBeVisible();
  expect(await violations(page)).toEqual([]);
  await page.getByRole("button", { name: t.local.expire }).click();
  await expect(page.getByTestId("expired")).toBeVisible();
  expect(await violations(page)).toEqual([]);
});

test("Mis preguntas, its confirmation, and the admin page", async ({ page }) => {
  await signIn(page, newUser(["Admin"]));
  await page.request.post("/api/runs", {
    headers: fromApp,
    data: { question: uniqueQuestion() },
  });
  await page.goto("/mis-preguntas");
  await expect(page.getByTestId("my-run")).toHaveCount(1);
  expect(await violations(page)).toEqual([]);
  await page.getByRole("button", { name: t.myRuns.remove }).click();
  await expect(page.getByRole("dialog", { name: t.myRuns.confirmTitle })).toBeVisible();
  expect(await violations(page)).toEqual([]);
  await page.keyboard.press("Escape");

  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: t.admin.modelsTitle })).toBeVisible();
  expect(await violations(page)).toEqual([]);
});

test("an answer with charts: their data and notes, a layer's discussion, the history", async ({
  page,
  request,
}) => {
  const runId = await finishedRun(request, CHART_QUESTION);
  await page.goto(`/r/${runId}`);
  await expect(page.getByTestId("stage-line")).toHaveText(DONE);
  for (const chart of await page.getByTestId("chart").all())
    await expect(chart.locator("svg").first()).toBeVisible();
  expect(await violations(page)).toEqual([]);

  const layer = page.getByTestId("layer").first();
  await layer.focus();
  await page.keyboard.press("Enter");
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("button", { name: t.common.close })).toBeFocused();
  expect(await violations(page)).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(layer).toBeFocused();

  await page.locator("summary", { hasText: t.history.title }).click();
  await expect(page.getByTestId("history-chart").first().locator("svg").first()).toBeVisible();
  await page.getByRole("button", { name: t.history.next }).click();
  expect(await violations(page)).toEqual([]);
});
