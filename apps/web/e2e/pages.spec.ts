import { expect, test } from "@playwright/test";
import { finishedRun, fromApp, newUser, signIn, signInAs, t, uniqueQuestion } from "./helpers.ts";

test("Mis preguntas lists a question; its link opens; deleting asks first, hides it from others, and it can be restored", async ({
  page,
  request,
  browser,
}) => {
  const user = newUser();
  const question = uniqueQuestion();
  await signInAs(request, user);
  const quote = await request.post("/api/runs", { headers: fromApp, data: { question } });
  expect(quote.status()).toBe(201);

  await signIn(page, user);
  await page.goto("/");
  await page.getByRole("button", { name: t.nav.account }).click();
  await page.getByRole("link", { name: t.nav.myRuns }).click();
  await expect(page.getByRole("heading", { level: 1, name: t.myRuns.title })).toBeVisible();
  const row = page.getByTestId("my-run").filter({ hasText: question });
  await expect(row).toContainText(t.myRuns.status.quoted);
  await expect(row).toContainText(t.myRuns.price(t.money(10_000, "ARS")));

  await row.getByRole("link", { name: question }).click();
  await expect(page.getByRole("heading", { level: 1, name: question })).toBeVisible();
  const link = page.url();
  await page.goBack();

  await row.getByRole("button", { name: t.myRuns.remove }).click();
  const dialog = page.getByRole("dialog", { name: t.myRuns.confirmTitle });
  await expect(dialog).toContainText(t.myRuns.confirmBody);
  await expect(dialog.getByRole("button", { name: t.common.cancel })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(row.getByRole("button", { name: t.myRuns.remove })).toBeFocused();

  await row.getByRole("button", { name: t.myRuns.remove }).click();
  await dialog.getByRole("button", { name: t.myRuns.confirm }).click();
  const deleted = page
    .getByTestId("deleted-runs")
    .getByTestId("my-run")
    .filter({ hasText: question });
  await expect(deleted).toHaveCount(1);
  await expect(page.getByText(t.myRuns.empty)).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: t.myRuns.removed })).toHaveCount(1);

  // Anyone else is told that its author deleted it; its author still reads it, marked.
  const stranger = await browser.newPage();
  await stranger.goto(link);
  await expect(stranger.getByRole("heading", { name: t.run.deletedTitle })).toBeVisible();
  await stranger.close();
  await page.goto(link);
  await expect(page.getByTestId("run-deleted")).toContainText(t.run.deleted);

  await page.getByRole("button", { name: t.run.restore }).click();
  await expect(page.getByTestId("run-deleted")).toHaveCount(0);
  await page.goto("/mis-preguntas");
  await expect(row).toHaveCount(1);
  await expect(page.getByTestId("deleted-runs")).toHaveCount(0);
});

test("the home page shows a question asked as a card with its picture, and a quote not", async ({
  page,
  request,
}) => {
  const asked = uniqueQuestion();
  const quoted = uniqueQuestion();
  await finishedRun(request, asked);
  expect(
    (await request.post("/api/runs", { headers: fromApp, data: { question: quoted } })).status(),
  ).toBe(201);

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: t.home.title })).toBeVisible();
  const card = page.getByTestId("question-card").filter({ hasText: asked });
  // Other tests ask at the same time: the card may be on a later page.
  await expect(page.getByTestId("question-card").first()).toBeVisible();
  const more = page.getByRole("button", { name: t.home.more });
  while ((await card.count()) === 0 && (await more.count()) > 0) {
    await more.click();
    await expect(page.getByRole("button", { name: t.home.loadingMore })).toHaveCount(0);
  }
  await expect(card).toHaveCount(1);
  await expect(card).toContainText(t.home.asked(t.day(Date.now())));
  const picture = card.locator("img");
  await expect(picture).toBeVisible();
  expect(await picture.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await expect(page.getByTestId("question-card").filter({ hasText: quoted })).toHaveCount(0);

  await card.getByRole("link", { name: asked }).click();
  await expect(page.getByRole("heading", { level: 1, name: asked })).toBeVisible();
});

test("Mis preguntas asks a signed-out reader to sign in, and is not in the menu", async ({
  page,
}) => {
  await page.goto("/mis-preguntas");
  await expect(page.getByText(t.myRuns.signIn)).toBeVisible();
  await expect(page.getByRole("link", { name: t.nav.myRuns })).toHaveCount(0);
});

test("an admin changes a price and the next quote shows it", async ({ page }, info) => {
  // The prices are shared by every test: one project changes them, the other would race it.
  test.skip(info.project.name !== "desktop", "the prices are global to the local mode");
  const admin = newUser(["Admin"]);
  await signIn(page, admin);
  await page.goto("/");
  await page.getByRole("button", { name: t.nav.account }).click();
  await page.getByRole("link", { name: t.nav.admin }).click();
  await expect(page.getByRole("heading", { level: 1, name: t.admin.title })).toBeVisible();

  const simple = page.getByLabel(t.admin.priceLabel.simple);
  const save = page.getByRole("button", { name: t.admin.savePrices });
  try {
    // A refusal of the API, in plain words, on its field.
    await simple.fill("0");
    await save.click();
    await expect(page.getByText(t.admin.fieldErrors.amount)).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: t.errors.invalid })).toBeVisible();
    await expect(simple).toHaveAttribute("aria-invalid", "true");

    await simple.fill("7.500");
    await save.click();
    await expect(page.getByText(t.admin.savedPrices)).toBeVisible();

    await page.getByRole("link", { name: t.nav.ask }).click();
    await page.getByLabel(t.ask.label).fill("¿Qué hora es en Tokio?");
    await page.getByRole("button", { name: t.ask.submit }).click();
    await expect(page.getByTestId("price")).toHaveText(t.money(7_500, "ARS"));
  } finally {
    await page.request.put("/api/admin/prices", {
      headers: fromApp,
      data: { prices: { simple: 5_000 } },
    });
  }
});

test("an admin sets the model of a role and puts it back on its default", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "the settings are global to the local mode");
  await signIn(page, newUser(["Admin"]));
  await page.goto("/admin");
  const grok = page.getByRole("group", { name: t.admin.roles["panel.grok"] ?? "" });
  await expect(grok).toContainText(t.admin.usesDefault);

  await grok.getByLabel(t.admin.family).selectOption("spacexai/grok");
  await grok.getByLabel(t.admin.effort).selectOption("high");
  await page.getByRole("button", { name: t.admin.saveModels }).click();
  await expect(page.getByText(t.admin.savedModels)).toBeVisible();
  await expect(grok).toContainText(t.admin.today("spacexai/grok-4.7"));

  await grok.getByRole("button", { name: t.admin.backToDefault }).click();
  await page.getByRole("button", { name: t.admin.saveModels }).click();
  await expect(grok).toContainText(t.admin.usesDefault);
  await expect(grok.getByLabel(t.admin.family)).toHaveValue("");
});

test("someone who is not an admin does not see the admin page", async ({ page }) => {
  const user = newUser();
  await signIn(page, user);
  await page.goto("/");
  await page.getByRole("button", { name: t.nav.account }).click();
  await expect(page.getByRole("link", { name: t.nav.myRuns })).toBeVisible();
  await expect(page.getByRole("link", { name: t.nav.admin })).toHaveCount(0);
  await page.goto("/admin");
  await expect(page.getByText(t.errors.notAdmin)).toBeVisible();
  await expect(page.getByLabel(t.admin.priceLabel.simple)).toHaveCount(0);
  const api = await page.request.get("/api/admin/prices");
  expect(api.status()).toBe(403);
});

test("the + of someone signed out signs them in first, then opens the page to ask", async ({
  page,
}) => {
  await page.goto("/mis-preguntas");
  await expect(page.getByRole("button", { name: t.nav.signIn }).first()).toBeVisible();
  await page.getByRole("link", { name: t.nav.ask }).click();
  await page.getByRole("button", { name: t.local.users.contrib }).click();
  await page.waitForURL((url) => url.pathname === "/new");
  await expect(page.getByLabel(t.ask.label)).toBeVisible();
});

test("Salir ends the session: the page offers to sign in again", async ({ page }) => {
  await signIn(page, newUser());
  await page.goto("/mis-preguntas");
  await page.getByRole("button", { name: t.nav.account }).click();
  await expect(page.getByRole("link", { name: t.nav.myRuns })).toBeVisible();
  await page.getByRole("button", { name: t.nav.signOut }).click();
  await page.waitForURL((url) => url.pathname === "/");
  await expect(page.getByRole("button", { name: t.nav.signIn })).toBeVisible();
  await expect(page.getByRole("link", { name: t.nav.myRuns })).toHaveCount(0);
  expect(await (await page.request.get("/api/me")).json()).toBeNull();
});

test("a sign-in that failed says so in plain words, once", async ({ page }) => {
  await page.goto("/new?signin=failed");
  await expect(page.getByRole("alert")).toHaveText(t.errors.signInFailed);
  await expect(page).toHaveURL((url) => url.pathname === "/new" && url.search === "");
});
