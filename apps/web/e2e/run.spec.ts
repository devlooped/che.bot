import { expect, test } from "@playwright/test";
import { ask, DONE, finishedRun, newUser, SCENARIO_QUESTION, signIn, t } from "./helpers.ts";

const price = t.money(10_000, "ARS");

test("sign in, ask, see the class and the price, pay, and reach a finished answer", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: t.ask.signInToAsk }).click();
  await page.getByRole("button", { name: t.local.users.beta }).click();
  await expect(page.getByLabel(t.ask.label)).toBeVisible();
  await page.getByLabel(t.ask.label).fill(SCENARIO_QUESTION);
  await page.getByRole("button", { name: t.ask.submit }).click();

  await expect(
    page.getByRole("heading", { name: t.quote.yourQuestion(t.quote.classes.complex) }),
  ).toBeVisible();
  await expect(page.getByTestId("price")).toHaveText(price);
  await expect(page.getByText(t.ask.publicNote)).toBeVisible();
  await page.getByRole("button", { name: t.quote.pay(price) }).click();

  const qr = page.getByRole("img", { name: t.payment.qrLabel(price) });
  await expect(qr).toBeVisible();
  await expect(page.getByText(t.payment.total(price))).toBeVisible();
  await expect(page.getByText(t.payment.waiting)).toBeVisible();
  await page.getByRole("button", { name: t.local.pay }).click();

  // The run plays live: the seats think, the stage line moves, the document appears.
  await expect(page.locator('[data-status="thinking"]').first()).toBeVisible();
  await expect(page.getByTestId("stage-line")).toHaveText(DONE, { timeout: 90_000 });
  await expect(page.getByTestId("paragraph")).toHaveCount(6);
  await expect(page.getByTestId("dissent")).toHaveCount(1);
  await expect(page.locator('[data-model="gemini"]')).toHaveAttribute("data-status", "abstained");
  await expect(page.getByRole("heading", { name: t.sources.title })).toBeVisible();
  await expect(page.getByRole("heading", { name: t.panel.title })).toBeVisible();
  await expect(page.getByText("anthropic/claude-opus-5.5")).toBeVisible();
});

test("a click on a margin mark opens its discussion, and the keyboard does too", async ({
  page,
  request,
}) => {
  const runId = await finishedRun(request);
  await page.goto(`/r/${runId}`);
  await expect(page.getByTestId("stage-line")).toHaveText(DONE);

  // The paragraph that said the figure exaggerates: two proposals, a change of mind, accepted.
  const contested = page.getByTestId("paragraph").filter({ hasText: "Hay quienes sostienen" });
  await contested.getByTestId("mark").click();
  const sheet = page.getByRole("dialog", { name: t.discussion.title });
  await expect(sheet).toBeVisible();
  const replace = t.discussion.actions.replace;
  await expect(sheet.getByText(t.discussion.proposal("Grok", replace))).toBeVisible();
  await expect(sheet.getByText(t.discussion.proposal("Gemini", replace))).toBeVisible();
  await expect(sheet.getByText(`${t.discussion.changed}:`)).toBeVisible();
  await expect(sheet.getByText(/me convenció/)).toBeVisible();
  await expect(sheet.getByText(t.discussion.outcome.accepted(3))).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();

  await page.getByTestId("mark").first().focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: t.discussion.title })).toBeVisible();
});

test("a reload while waiting for payment shows the same QR", async ({ page }) => {
  await signIn(page, newUser());
  await ask(page);
  await page.getByRole("button", { name: t.quote.pay(price) }).click();
  const qr = page.getByRole("img", { name: t.payment.qrLabel(price) });
  await expect(qr).toBeVisible();
  const payload = await qr.getAttribute("data-qr");
  expect(payload).toMatch(/^000201/);

  await page.reload();
  await expect(qr).toBeVisible();
  expect(await qr.getAttribute("data-qr")).toBe(payload);
  await expect(page.getByText(t.payment.waiting)).toBeVisible();
});

test("a shared link opens signed out", async ({ page, request }) => {
  const runId = await finishedRun(request);
  await page.goto(`/r/${runId}`);
  await expect(page.getByRole("heading", { name: SCENARIO_QUESTION })).toBeVisible();
  await expect(page.getByTestId("stage-line")).toHaveText(DONE);
  await expect(page.getByTestId("paragraph").first()).toBeVisible();
  await expect(page.getByRole("button", { name: t.nav.signIn })).toBeVisible();
  await expect(page.getByTestId("payment")).toHaveCount(0);
  await expect(page.getByTestId("quote")).toHaveCount(0);
});

test("an admin runs without paying", async ({ page }) => {
  await signIn(page, newUser(["admin"]));
  await ask(page);
  await expect(page.getByText(t.quote.adminNote)).toBeVisible();
  await page.getByRole("button", { name: t.quote.adminRun }).click();
  await expect(page.getByTestId("payment")).toHaveCount(0);
  await expect(page.getByTestId("stage-line")).not.toHaveText(t.stage.quoted);
});

test("a refusal of the API reads in plain words", async ({ page }) => {
  await signIn(page, newUser([]));
  await page.goto("/");
  await page.getByLabel(t.ask.label).fill("¿Qué hora es en Tokio?");
  await page.getByRole("button", { name: t.ask.submit }).click();
  await expect(page.getByRole("alert")).toHaveText(t.errors.noAccess);
});
