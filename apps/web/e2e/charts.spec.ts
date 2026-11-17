import { expect, type Page, test } from "@playwright/test";
import {
  CHART_QUESTION,
  DONE,
  finishedRun,
  newUser,
  SAMPLE_CSV,
  signIn,
  t,
  UPLOAD_QUESTION,
} from "./helpers.ts";

// The chart view (step 41) against the scripted chart runs of the local mode
// (src/local/chart-scenario.ts): web data with agreed rows, a row settled by its source, a range and
// a lone value; and an upload whose numbers come from the table.

const unique = (question: string) => `${question} (${crypto.randomUUID().slice(0, 8)})`;

/** Asks for a chart on the ask page, with the user's file when there is one. */
async function askForChart(
  page: Page,
  question: string,
  file: { name: string; csv: string } | null,
) {
  await page.goto("/");
  await page.getByLabel(t.ask.label).fill(question);
  await page.getByLabel(t.ask.chart.toggle).check();
  if (file) {
    await page.getByLabel(t.ask.chart.file).check();
    await page.getByLabel(t.ask.chart.fileLabel).setInputFiles({
      name: file.name,
      mimeType: "text/csv",
      buffer: Buffer.from(file.csv),
    });
  }
}

/** Pays the quote shown and waits for the run to finish. */
async function payAndFinish(page: Page) {
  await page.getByRole("button", { name: /^Pagar/ }).click();
  await page.getByRole("button", { name: t.local.pay }).click();
  await expect(page.getByTestId("stage-line")).toHaveText(DONE, { timeout: 90_000 });
  await expect(page.getByTestId("chart").locator("svg").first()).toBeVisible();
}

const row = (page: Page, label: string) =>
  page.getByTestId("chart-row").filter({ has: page.getByRole("rowheader", { name: label }) });

test("ask for a chart of web data, pay, and read the finished chart with its sources and notes", async ({
  page,
}) => {
  await signIn(page, newUser());
  await askForChart(page, unique(CHART_QUESTION), null);
  await page.getByRole("button", { name: t.ask.submit }).click();
  await expect(page.getByTestId("chart-request")).toHaveText(t.quote.chart.web);
  await payAndFinish(page);

  await expect(page.getByTestId("chart-title")).toHaveText(
    "Inflación mensual en la Argentina, enero a junio de 2025",
  );
  await expect(page.getByTestId("chart-caption")).toContainText("rango");
  await expect(page.getByTestId("chart")).toHaveAttribute("aria-label", /^Gráfico: /);

  // every web-sourced row opens its citation
  const rows = page.getByTestId("chart-row");
  await expect(rows).toHaveCount(6);
  for (const r of await rows.all()) {
    await expect(r.locator(".row-source a")).toHaveAttribute("href", /^https:\/\//);
    await expect(r.locator("q")).toHaveCount(1);
  }

  // the corrected point: what it was, what it is, the source that settled it, who said what
  const notes = page.getByTestId("row-note");
  const march = notes.filter({ hasText: t.chart.note(1) });
  await expect(row(page, "marzo de 2025")).toContainText(t.chart.kinds.corrected);
  await expect(march).toContainText(t.chart.notes.corrected("3,3", "3,7"));
  await expect(march).toContainText(t.chart.notes.settledBy);
  await expect(march.getByRole("link", { name: /INDEC/ }).first()).toBeVisible();
  await expect(march).toContainText(t.chart.notes.said("Claude y ChatGPT", 2, "3,3"));

  // the disputed point: a range with both values and both sources
  const may = notes.filter({ hasText: t.chart.note(2) });
  await expect(row(page, "mayo de 2025")).toContainText(t.chart.range("1,5", "1,9"));
  await expect(may).toContainText(t.chart.notes.range("1,5", "1,9"));
  await expect(may.getByRole("link", { name: /Ecolatina/ })).toBeVisible();
  await expect(may.getByRole("link", { name: /Ciudad de Buenos Aires/ })).toBeVisible();

  // the value of one model that no source confirmed says so
  await expect(notes.filter({ hasText: t.chart.note(3) })).toContainText(
    t.chart.notes.loneUnverified("Gemini"),
  );

  // the bars stayed without agreement
  await expect(page.getByTestId("dissent")).toContainText(t.chart.patch.mark("de barras"));
});

test("a voted layer opens its discussion, and the history shows an earlier version", async ({
  page,
  request,
}) => {
  const runId = await finishedRun(request, unique(CHART_QUESTION), {});
  await page.goto(`/r/${runId}`);
  await expect(page.getByTestId("stage-line")).toHaveText(DONE);

  await page.getByRole("button", { name: new RegExp(`^${t.chart.layers.names.title}`) }).click();
  const sheet = page.getByRole("dialog", { name: t.chart.layers.sheetTitle.title });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText(t.discussion.proposal("Claude", t.chart.patch.title))).toBeVisible();
  await expect(sheet.getByText("Inflación mensual de 2025", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();

  await page.getByRole("button", { name: t.chart.history.show }).click();
  const step = page.getByTestId("history-chart");
  await expect(page.getByTestId("history-label")).toContainText(t.history.steps.merge);
  await expect(step).toHaveAttribute("data-version", "1");
  await expect(step).toContainText("Inflación mensual de 2025");
  await expect(step.locator("svg").first()).toBeVisible();
  await page.getByRole("button", { name: t.history.next }).click();
  await expect(page.getByTestId("history-label")).toContainText(t.chart.history.steps.sources);
  await expect(page.getByTestId("history-changes")).toContainText(
    t.chart.history.row.corrected("marzo de 2025", "3,3", "3,7"),
  );
  await page.getByRole("button", { name: t.history.next }).click();
  await expect(page.getByTestId("history-changes")).toContainText(
    t.chart.history.layerBy(t.chart.layers.names.title, "Claude"),
  );
});

test("a chart of the user's table: the page says every number comes from the table", async ({
  page,
}) => {
  await signIn(page, newUser());
  await askForChart(page, unique(UPLOAD_QUESTION), { name: "ventas.csv", csv: SAMPLE_CSV });
  await expect(page.getByText(t.ask.chart.fileReady("ventas.csv", 12, 3))).toBeVisible();
  await page.getByRole("button", { name: t.ask.submit }).click();
  await expect(page.getByTestId("chart-request")).toHaveText(t.quote.chart.user);
  await payAndFinish(page);

  const from = page.getByTestId("from-table");
  await expect(from).toContainText(t.chart.user.fromTable);
  await expect(from).toContainText(t.chart.user.calculation("la suma de «ventas» por «sucursal»"));
  await expect(page.getByTestId("drawn-row")).toHaveCount(4);
  await expect(page.getByTestId("drawn-row").first()).toContainText("4.514.750");
  await expect(page.getByTestId("chart-row")).toHaveCount(0);
});

test("a file beyond the limits is refused in plain words, before anything is asked", async ({
  page,
}) => {
  await signIn(page, newUser());
  const rows = `a,b\n${"1,2\n".repeat(600)}`;
  await askForChart(page, unique(UPLOAD_QUESTION), { name: "largo.csv", csv: rows });
  await expect(page.getByTestId("file-error")).toHaveText(t.errors.file.too_many_rows as string);

  await page.getByLabel(t.ask.chart.fileLabel).setInputFiles({
    name: "pesado.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(`texto\n${`${"x".repeat(150)}\n`.repeat(450)}`),
  });
  await expect(page.getByTestId("file-error")).toHaveText(t.errors.file.too_large as string);
  await page.getByRole("button", { name: t.ask.submit }).click();
  await expect(page.getByRole("alert").filter({ hasText: t.errors.file.too_large })).toHaveCount(2);
  await expect(page).toHaveURL(/\/$/);
});
