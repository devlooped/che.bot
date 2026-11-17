import { expect, test } from "@playwright/test";
import { fromApp, newUser, signIn, signInAs, t, uniqueQuestion } from "./helpers.ts";

test("Mis preguntas lists a question; its link opens; deleting asks first, and the link then says it does not exist", async ({
  page,
  request,
}) => {
  const user = newUser();
  const question = uniqueQuestion();
  await signInAs(request, user);
  const quote = await request.post("/api/runs", { headers: fromApp, data: { question } });
  expect(quote.status()).toBe(201);

  await signIn(page, user);
  await page.goto("/");
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
  await expect(row).toHaveCount(0);
  await expect(page.getByText(t.myRuns.empty)).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: t.myRuns.removed })).toHaveCount(1);

  await page.goto(link);
  await expect(page.getByRole("heading", { name: t.errors.runNotFound })).toBeVisible();
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
  await expect(page.getByRole("link", { name: t.nav.myRuns })).toBeVisible();
  await expect(page.getByRole("link", { name: t.nav.admin })).toHaveCount(0);
  await page.goto("/admin");
  await expect(page.getByText(t.errors.notAdmin)).toBeVisible();
  await expect(page.getByLabel(t.admin.priceLabel.simple)).toHaveCount(0);
  const api = await page.request.get("/api/admin/prices");
  expect(api.status()).toBe(403);
});

test("Salir ends the session: the page offers to sign in again", async ({ page }) => {
  await signIn(page, newUser());
  await page.goto("/mis-preguntas");
  await expect(page.getByRole("link", { name: t.nav.myRuns })).toBeVisible();
  await page.getByRole("button", { name: t.nav.signOut }).click();
  await page.waitForURL((url) => url.pathname === "/");
  await expect(page.getByRole("button", { name: t.nav.signIn })).toBeVisible();
  await expect(page.getByRole("link", { name: t.nav.myRuns })).toHaveCount(0);
  expect(await (await page.request.get("/api/me")).json()).toBeNull();
});

test("a sign-in that failed says so in plain words, once", async ({ page }) => {
  await page.goto("/?signin=failed");
  await expect(page.getByRole("alert")).toHaveText(t.errors.signInFailed);
  await expect(page).toHaveURL((url) => url.pathname === "/" && url.search === "");
});
