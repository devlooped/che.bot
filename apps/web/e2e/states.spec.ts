import { expect, test } from "@playwright/test";
import { ask, DONE, finishedRun, MARKERS, newUser, signIn, t, uniqueQuestion } from "./helpers.ts";

// The history of the text, and the states around the happy path: each is played by the local mode
// (a marker in the question, or a button of the local mode).

const price = t.money(10_000, "ARS");

test("the slider shows an earlier version of the text, by pointer or by keyboard", async ({
  page,
  request,
}) => {
  const runId = await finishedRun(request);
  await page.goto(`/r/${runId}`);
  await expect(page.getByTestId("stage-line")).toHaveText(DONE);
  // The answer as it ended: the paragraph that said the figure exaggerates was replaced.
  const merged = "Por eso la cifra de 15.400 litros exagera el impacto";
  await expect(page.getByTestId("paragraph").filter({ hasText: merged })).toHaveCount(0);

  await page.getByRole("button", { name: t.history.show }).click();
  const slider = page.getByRole("slider", { name: t.history.slider });
  const label = page.getByTestId("history-label");
  const steps = page.getByTestId("history-paragraph");
  await expect(slider).toHaveValue("0");
  await expect(label).toContainText(t.history.steps.merge);
  await expect(steps.filter({ hasText: merged })).toBeVisible();

  await slider.focus();
  await page.keyboard.press("ArrowRight");
  await expect(label).toContainText(t.history.steps.round(2));
  // Claude's accepted change on the water taken from rivers, marked in its ink.
  await expect(page.locator(".hist-changed.ink-claude ins").first()).toBeVisible();
  await page.keyboard.press("End");
  await expect(label).toContainText(t.history.steps.edit);
  await page.getByRole("button", { name: t.history.previous }).click();
  await expect(label).toContainText(t.history.steps.round(3));
  // Grok's wording replaced the paragraph: what entered is in its ink, what left is struck through.
  const replaced = page.locator(".hist-changed.ink-grok");
  await expect(replaced.locator("ins").filter({ hasText: /Hay quienes sostienen/ })).toBeVisible();
  await expect(replaced.locator("del").first()).toBeVisible();

  // A tap or a click at the start of the bar goes back to the first version.
  const box = await slider.boundingBox();
  await slider.click({ position: { x: 3, y: (box?.height ?? 40) / 2 } });
  await expect(label).toContainText(t.history.steps.merge);
});

test("a failed paid run offers its owner the free rerun, and it runs", async ({
  page,
  browser,
}) => {
  await signIn(page, newUser());
  const runId = await ask(page, uniqueQuestion(MARKERS.fail));
  await page.getByRole("button", { name: t.quote.pay(price) }).click();
  await expect(page.getByRole("img", { name: t.payment.qrLabel(price) })).toBeVisible();
  await page.getByRole("button", { name: t.local.pay }).click();

  const failure = page.getByTestId("failure");
  await expect(failure).toBeVisible({ timeout: 30_000 });
  await expect(failure).toContainText(t.failure.reasons.no_drafts);
  await expect(failure).toContainText(t.failure.rerunOffer);
  await expect(page.getByTestId("stage-line")).toHaveText(t.stage.failed);
  await expect(page.locator('[data-status="abstained"][data-model]')).toHaveCount(4);

  // A reader who is not the owner sees why, and no button.
  const other = await (await browser.newContext()).newPage();
  await other.goto(`/r/${runId}`);
  await expect(other.getByTestId("failure")).toContainText(t.failure.reader);
  await expect(other.getByRole("button", { name: t.failure.rerun })).toHaveCount(0);
  await other.context().close();

  await page.getByRole("button", { name: t.failure.rerun }).click();
  await expect(failure).toBeHidden();
  await expect(page.getByText(t.failure.secondAttempt)).toBeVisible();
  await expect(page.getByTestId("stage-line")).toHaveText(DONE, { timeout: 90_000 });
  await expect(page.getByTestId("paragraph").first()).toBeVisible();
});

test("an expired payment says so, and its owner asks again", async ({ page }) => {
  await signIn(page, newUser());
  const first = await ask(page, uniqueQuestion());
  await page.getByRole("button", { name: t.quote.pay(price) }).click();
  await expect(page.getByRole("img", { name: t.payment.qrLabel(price) })).toBeVisible();
  await page.getByRole("button", { name: t.local.expire }).click();

  const expired = page.getByTestId("expired");
  await expect(expired).toContainText(t.payment.expired);
  await expect(page.getByTestId("stage-line")).toHaveText(t.stage.expired);
  await expect(page.getByRole("img", { name: t.payment.qrLabel(price) })).toHaveCount(0);
  await expired.getByRole("button", { name: t.payment.askAgain }).click();
  await page.waitForURL(
    (url) => /\/r\/[0-9a-f-]{36}$/.test(url.pathname) && !url.pathname.endsWith(first),
  );
  await expect(page.getByTestId("price")).toHaveText(price);
});

test("a reload in the middle of a run catches up at once and goes on live", async ({ page }) => {
  await signIn(page, newUser(["Admin"]));
  await ask(page, uniqueQuestion());
  await page.getByRole("button", { name: t.quote.adminRun }).click();
  await expect(page.getByTestId("paragraph").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("stage-line")).not.toHaveText(DONE);

  await page.reload();
  // Everything so far renders in one go: no event-by-event playback of the past.
  await expect(page.getByTestId("paragraph").first()).toBeVisible({ timeout: 3_000 });
  await expect(page.getByTestId("stage-line")).toHaveText(DONE, { timeout: 90_000 });
  await expect(page.getByTestId("dissent")).toHaveCount(1);
});

test("a model that did not answer reads well in its seat, the notes and the discussion", async ({
  page,
  request,
}) => {
  const runId = await finishedRun(request);
  await page.goto(`/r/${runId}`);
  const gemini = page.locator('[data-model="gemini"]');
  await expect(gemini).toHaveAttribute("data-status", "abstained");
  await expect(gemini).toContainText(t.abstainedLater.votes);
  await expect(page.getByTestId("notes")).toContainText(t.flags.abstained.votes("Gemini", 1));
  await expect(page.getByTestId("dissent")).toContainText(t.dissent.silent("Gemini"));
});

test("fewer than three answers: the answer says so", async ({ page, request }) => {
  const runId = await finishedRun(request, uniqueQuestion(MARKERS.fewDrafts));
  await page.goto(`/r/${runId}`);
  await expect(page.getByTestId("stage-line")).toHaveText(DONE);
  await expect(page.getByTestId("notes")).toContainText(t.flags.fewDrafts(2));
  await expect(page.locator('[data-model][data-status="abstained"]')).toHaveCount(2);
  await expect(page.getByTestId("paragraph").first()).toBeVisible();
});

test("the budget reached: the answer stays, with a note on what was left out", async ({
  page,
  request,
}) => {
  const runId = await finishedRun(request, uniqueQuestion(MARKERS.budget));
  await page.goto(`/r/${runId}`);
  await expect(page.getByTestId("stage-line")).toHaveText(DONE);
  await expect(page.getByTestId("notes")).toContainText(t.flags.budgetReached.discussion);
  await expect(page.getByTestId("paragraph")).toHaveCount(5);
  // No discussion happened, so the text has one version and no history to replay.
  await expect(page.getByRole("button", { name: t.history.show })).toHaveCount(0);
});
