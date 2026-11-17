import { expect, type Locator, type Page, test } from "@playwright/test";
import {
  CHART_QUESTION,
  DONE,
  finishedRun,
  newUser,
  SCENARIO_QUESTION,
  signIn,
  t,
} from "./helpers.ts";

// The charts of an answer (step 41) against the scripted runs of the local mode
// (src/local/chart-scenario.ts): CHART_QUESTION answers with two paragraphs and two charts among
// them. In the inflation chart, agreed rows, a row settled by its source, a range and a lone value;
// the chart of the wages, every row agreed. Any other question answers with text alone.

const unique = (question: string) => `${question} (${crypto.randomUUID().slice(0, 8)})`;

/** The chart `id` of the answer. */
const chartOf = (page: Page, id: string) =>
  page.locator(`[data-testid="chart-block"][data-chart="${id}"]`);

const row = (chart: Locator, label: string) =>
  chart
    .getByTestId("chart-row")
    .filter({ has: chart.page().getByRole("rowheader", { name: label }) });

test("nothing to ask for: the drafts put charts in the answer, each in its place among the paragraphs", async ({
  page,
}) => {
  await signIn(page, newUser());
  await page.goto("/");
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await page.getByLabel(t.ask.label).fill(unique(CHART_QUESTION));
  await page.getByRole("button", { name: t.ask.submit }).click();
  await page.getByRole("button", { name: /^Pagar/ }).click();
  await page.getByRole("button", { name: t.local.pay }).click();
  await expect(page.getByTestId("stage-line")).toHaveText(DONE, { timeout: 90_000 });

  // the paragraphs and the charts, in the order of the document
  const blocks = page.locator(
    '.doc > [data-testid="paragraph"], .doc > [data-testid="chart-block"]',
  );
  await expect(blocks).toHaveCount(4);
  expect(
    await blocks.evaluateAll((els) =>
      els.map((e) => e.getAttribute("data-chart") ?? e.getAttribute("data-testid")),
    ),
  ).toEqual(["paragraph", "c1", "paragraph", "c2"]);

  const inflation = chartOf(page, "c1");
  await expect(inflation.getByTestId("chart").locator("svg").first()).toBeVisible();
  await expect(inflation.getByTestId("chart-title")).toHaveText(
    "Inflación mensual en la Argentina, enero a junio de 2025",
  );
  await expect(inflation.getByTestId("chart-caption")).toContainText("rango");
  await expect(inflation.getByTestId("chart")).toHaveAttribute("aria-label", /^Gráfico: /);

  // every row opens its citation
  const rows = inflation.getByTestId("chart-row");
  await expect(rows).toHaveCount(6);
  for (const r of await rows.all()) {
    await expect(r.locator(".row-source a")).toHaveAttribute("href", /^https:\/\//);
    await expect(r.locator("q")).toHaveCount(1);
  }

  // the corrected point: what it was, what it is, the source that settled it, who said what
  const notes = inflation.getByTestId("row-note");
  const march = notes.filter({ hasText: t.chart.note(1) });
  await expect(row(inflation, "marzo de 2025")).toContainText(t.chart.kinds.corrected);
  await expect(march).toContainText(t.chart.notes.corrected("3,3", "3,7"));
  await expect(march).toContainText(t.chart.notes.settledBy);
  await expect(march.getByRole("link", { name: /INDEC/ }).first()).toBeVisible();
  const said = march.locator(".row-note-value", { hasText: t.chart.notes.said("3,3") });
  const by = said.locator('[data-part="by"]').getByRole("button");
  await expect(by).toHaveCount(2);
  await expect(by.nth(0)).toHaveAccessibleName("ChatGPT");
  await expect(by.nth(1)).toHaveAccessibleName("Claude");

  // the disputed point: a range with both values and both sources
  const may = notes.filter({ hasText: t.chart.note(2) });
  await expect(row(inflation, "mayo de 2025")).toContainText(t.chart.range("1,5", "1,9"));
  await expect(may).toContainText(t.chart.notes.range("1,5", "1,9"));
  await expect(may.getByRole("link", { name: /Ecolatina/ })).toBeVisible();
  await expect(may.getByRole("link", { name: /Ciudad de Buenos Aires/ })).toBeVisible();

  // the value of one model that no source confirmed says so
  await expect(notes.filter({ hasText: t.chart.note(3) })).toContainText(
    t.chart.notes.loneUnverified("Gemini"),
  );

  // the bars stayed without agreement
  await expect(inflation.getByTestId("dissent")).toContainText(t.chart.patch.mark("de barras"));

  // the chart of the wages: every row agreed, no note
  const wages = chartOf(page, "c2");
  await expect(wages.getByTestId("chart-row")).toHaveCount(3);
  await expect(wages.getByTestId("row-note")).toHaveCount(0);

  // the sources of the rows are listed once with those of the text
  await expect(page.getByRole("link", { name: /RIPTE/ }).first()).toBeVisible();
});

test("a voted layer opens its discussion, and the history moves the charts with the text", async ({
  page,
  request,
}) => {
  const runId = await finishedRun(request, unique(CHART_QUESTION));
  await page.goto(`/r/${runId}`);
  await expect(page.getByTestId("stage-line")).toHaveText(DONE);

  const inflation = chartOf(page, "c1");
  await inflation
    .getByRole("button", { name: new RegExp(`^${t.chart.layers.names.title}`) })
    .click();
  const sheet = page.getByRole("dialog", { name: t.chart.layers.sheetTitle.title });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText(t.discussion.proposal("Claude", t.chart.patch.title))).toBeVisible();
  await expect(sheet.getByText("Inflación mensual de 2025", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();

  await page.locator("summary", { hasText: t.history.title }).click();
  const step = page.locator('[data-testid="history-chart"][data-chart="c1"]');
  await expect(page.getByTestId("history-label")).toContainText(t.history.steps.merge);
  await expect(step).toHaveAttribute("data-version", "1");
  await expect(step).toContainText("Inflación mensual de 2025");
  await expect(step.locator("svg").first()).toBeVisible();
  await expect(page.getByTestId("history-chart")).toHaveCount(2);
  await expect(page.getByTestId("history-paragraph")).toHaveCount(2);
  await page.getByRole("button", { name: t.history.next }).click();
  await expect(page.getByTestId("history-label")).toContainText(t.chart.history.steps.sources);
  await expect(step.getByTestId("history-changes")).toContainText(
    t.chart.history.row.corrected("marzo de 2025", "3,3", "3,7"),
  );
  await page.getByRole("button", { name: t.history.next }).click();
  await expect(step.getByTestId("history-changes")).toContainText(
    t.chart.history.layerBy(t.chart.layers.names.title, "Claude"),
  );
});

test("a question whose drafts propose no chart answers with text alone", async ({
  request,
  page,
}) => {
  const runId = await finishedRun(request, unique(SCENARIO_QUESTION));
  await page.goto(`/r/${runId}`);
  await expect(page.getByTestId("stage-line")).toHaveText(DONE);
  await expect(page.getByTestId("paragraph").first()).toBeVisible();
  await expect(page.getByTestId("chart-block")).toHaveCount(0);
});
