# che.bot

A web app where four AI models (Grok, Claude, OpenAI, Gemini) each draft an answer alone, then converge on one answer through a fixed, code-run protocol of tracked suggestions and votes over a shared document. Signed-in users pay per question by QR.

The full plan: [.alta/plans/2026-11-16-consensus-answers.md](.alta/plans/2026-11-16-consensus-answers.md).

## Build order

0. **Scaffold**: pnpm TypeScript workspace (this repository state).
1. **Protocol**: the protocol as a headless script, and its evaluation on about 50 questions (does it beat the best single model?).
2. **Runtime**: the Cloudflare Durable Object runtime, sign-in, payment and the event stream.
3. **UI**: the Spanish (rioplatense) UI over the event stream.
4. **Charts**: charts as document blocks.

## Layout

- `packages/protocol`: types, schemas, reducer, prompts. No I/O.
- `packages/providers`: model providers, roles, families, catalog.
- `packages/driver`: the loop that makes the calls of a step through a ledger (CLI and `RunObject`).
- `packages/charts`: the render gate of chart runs: Vega-Lite to SVG in Vega's interpreter mode.
- `apps/cli`: headless runner and evaluation (Node).
- `apps/web`: the Worker (API, `RunObject` per question, `SpendMeter`), D1 migrations, and the React app (phase 3).
- `eval/`: the question set (`questions.jsonl`) and the evaluation reports (`results/`).

## Usage

Requires Node 22+ and pnpm 10.

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm lint
```

`AI_GATEWAY_API_KEY` must be set for the commands that call models.

```sh
# One question through the full process: the class sets only the price; --mode quick stops
# after the merge. Logs go to .runs/.
pnpm cli ask "¿Cuánto mide el Aconcagua?" --max-usd 1

# A chart run: the four models find the data on the web, each value with its citation, or chart
# the rows of a CSV (--csv implies --chart). Writes chart.vl.json (the Vega-Lite spec, data and
# theme included), rows.json (the rows with their sources and disputes) and chart-v<N>.svg (every
# version) next to the logs, and prints the brief, the rows, the disputes and the cost.
pnpm cli ask "¿Cuál fue la inflación mensual de Argentina en 2026?" --chart --max-usd 1.5
pnpm cli ask "¿Cuánto facturó cada producto por trimestre?" --csv ventas.csv

# The evaluation of phase 1. --max-usd caps the spend of the whole evaluation, earlier
# invocations included; every call is kept under eval/results/raw/, so a rerun pays nothing twice
# and an interrupted evaluation continues where it stopped.
pnpm cli eval --set eval/questions.jsonl --max-usd 60
pnpm cli eval --set eval/questions.jsonl --only q03,q22 --max-usd 5 --out eval/results/smoke
# Rebuild the report from disk, with your grades from grades.txt, without any model call.
pnpm cli eval --set eval/questions.jsonl --report --out eval/results/<date>
```

The evaluation writes `report.md` and `report.json`, and, once complete, `grading-sheet.md` with
20 blind answer pairs and `grades.txt` for your choices, in `eval/results/<date>/` (or `--out`).
The sheet only grows: its pairs and your grades never change, and a kind of pair added to the
evaluation later is appended after them.

## The web app (`apps/web`)

```sh
pnpm --filter @chebot/web dev       # the local mode: every outside service is a fake, see below
pnpm --filter @chebot/web dev:live  # real services: apps/web/.dev.vars and .env (see the .example files)
pnpm --filter @chebot/web test      # the Worker in the Workers runtime, then the app's own tests in Node
pnpm --filter @chebot/web test:e2e  # Playwright against the local mode (needs a browser, see below)
pnpm --filter @chebot/web build     # the production build, then a check that no fake reached it
```

The local mode (`vite dev --mode fakes`, `wrangler.local.jsonc`, `src/local/`) runs the real Worker,
`RunObject` and protocol with fakes for the rest: a scripted panel that plays one full run in
Spanish whatever the question (four drafts, agreed, majority and contested paragraphs, two rounds of
suggestions and votes, a change of position, an accepted change and one without agreement, a model
that does not answer, the editor), a classifier (up to 80 characters is simple), a jobs service
whose QR appears at once (`POST /api/local/pay/:id`, or the "Simular el pago" button, plays the
payment and calls the hook), a Gateway catalog with a few more families for the admin page, and a
sign-in that picks a test user (beta, admin, or no access). The production entry never imports
`src/local`, and `pnpm build` fails if anything of it is in the output (`scripts/check-build.mjs`).

A run asked for a chart ("Quiero un gráfico" on the ask page) plays the scripted chart run of
`src/local/chart-scenario.ts` instead, through the real renderer: with data from the web, the monthly
inflation of the first half of 2025, whatever the question; with an upload, any CSV (the briefs read
its columns: three sum the first number column by the first text column, one averages it).
`SAMPLE_CSV` in that file is an upload to try.

The states around the happy path are played the same way, to see and test them:

| To see                                   | Do                                                                                                                      |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| A run that fails, and its free rerun     | Ask with `[falla]` in the question and pay: no model answers the drafts the first time, so the rerun plays the full run |
| Fewer than three answers                 | Ask with `[pocas]`: Grok and Gemini do not answer the drafts                                                            |
| The budget reached before the discussion | Ask with `[presupuesto]`: the drafts spend nearly all of it                                                             |
| An expired payment                       | "Simular que venció el QR" under the QR (`POST /api/local/expire/:id`)                                                  |
| A model that does not answer             | Every run: Gemini misses the last round of votes                                                                        |
| A chart: agreed rows                     | "Quiero un gráfico", data from the web: January, February and April                                                     |
| A point corrected by its source          | The same chart: March, drawn at 3,3 (two models) and settled at 3,7 by the statistics office                            |
| A point drawn as a range                 | The same chart: May, 1,5 and 1,9, neither source held up                                                                |
| A value of one model, not confirmed      | The same chart: June, Gemini's alone                                                                                    |
| Voted layers, and one without agreement  | The same chart: the title and the explanation accepted, bars instead of the line two against two                        |
| An earlier version of a chart            | "Ver cómo cambió el gráfico" on a finished chart: three versions                                                        |
| A chart of the user's table              | "Quiero un gráfico", "De mi tabla", and a CSV file; a file beyond the limits is refused before asking                   |

The pages: `/` asks (for a text, or for a chart of data from the web or of a CSV), `/r/:id` follows
a run and replays how its text or its chart formed, `/mis-preguntas` lists
the user's questions (copy a link, delete one), and `/admin` sets the model of each role and the two
prices (admins only; the menu hides it from others).

The end-to-end tests start the local mode themselves. They need Playwright's Chromium
(`pnpm --filter @chebot/web exec playwright install chromium`) or a browser of the machine:
`PLAYWRIGHT_CHANNEL=msedge` (or `chrome`). They run at a phone width and a desktop width, and
`e2e/a11y.spec.ts` checks the main pages and states with axe (WCAG 2.1 A and AA, and its best
practices).

The browser app signs in with the Auth0 SPA SDK, configured by public build variables:
`VITE_AUTH0_DOMAIN`, `VITE_AUTH0_CLIENT_ID` and `VITE_AUTH0_AUDIENCE` (see `apps/web/.env.example`).

| Route                                                                        | Who may call it                                                    |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `POST /api/runs {question, chart?}` → `201 {runId, class, amount, currency}` | signed in; the `admin` or `beta` role until `LAUNCHED` is `"true"` |
| `POST /api/runs/:id/pay` → `202`                                             | the owner; an `admin` owner runs free, with no payment job         |
| `POST /api/runs/:id/rerun` → `202`                                           | the owner, once, after a paid run failed                           |
| `DELETE /api/runs/:id`                                                       | the owner or an admin                                              |
| `GET /api/runs/:id`, `/events?after=`, `/ws?after=`, `/snapshots/:v`         | anyone with the link (`mine` in the summary: the caller owns it)   |
| `GET /api/runs/:id/charts/:v.svg`                                            | anyone with the link: the render of version `v` of a chart run     |
| `GET /api/me/runs`                                                           | signed in                                                          |
| `GET`, `PUT /api/admin/models`, `/api/admin/prices`                          | `admin`                                                            |
| `POST /api/pay/hook`                                                         | the jobs service, with the run's own token as Bearer               |

A chart run is asked with `chart` in the body: `{ "chart": {} }` for data from the web, or
`{ "chart": { "csv": "<the text of the file>" } }` for an upload, parsed when it is asked (at most
64 KB, 500 rows and 12 columns; a bad file answers 400 before anything is paid, with `reason`
`csv_<code>`, such as `csv_too_many_rows`, which the page words for the user). The summary of a run
says `chart: "web" | "user" | null`.

The render gate of chart runs runs inside `RunObject`. Step 36 measured it in the Workers runtime:
Vega in interpreter mode renders a chart in 35 ms the first time and 7 ms after (without the
interpreter Vega fails there with "Code generation from strings disallowed"); its packages add
851 KiB minified (296 KiB gzip), whose evaluation takes 40-110 ms of the 1 s startup limit. The
production build puts them in a chunk of their own that `RunObject` imports on its first render, so
a Worker that only answers the API never evaluates it; the whole upload is 2,545 KiB (631 KiB gzip).

The page of a chart run (step 41) draws the chart with `vega-embed` (no interpreter: the browser may
compile expressions), loaded with a dynamic import by `ChartCanvas`, so a text answer never downloads
it: the browser chunk of the chart is 854 KB minified (294 KB gzip), beside 429 KB (132 KB gzip)
for the rest of the app. The spec of the page (`src/app/chart/spec.ts`) is the chart's layers and
fixed theme, with the title out of the drawing (it is a heading), a named data
set, and for web data the range of an unsettled row with both its ends and the number of the note of
every corrected, disputed or unconfirmed point. A new version with the same layers moves the marks:
the data set is tweened frame by frame (`src/app/chart/embed.ts`); a version whose kind, axes or
calculation changed is drawn again, faded in; with reduced motion every change is immediate. Under
the chart, the table is its text: every web row with its value, its source and the words that state
it, and a note on each corrected point (what it was, what it is, the source that settled it, who
said what), on each range (both values and their sources) and on each value no source confirmed; a
chart of an upload says that every number comes from the table, and the calculation the models
agreed on in plain words. The layers the models voted on (the kind of chart, the title, the
explanation, the calculation) open their discussions like the paragraphs of a text.

Sign-in is an Auth0 access token (`Authorization: Bearer`), verified with the tenant's JWKS
(RS256, issuer `https://AUTH0_DOMAIN/`, audience `AUTH0_AUDIENCE`); the roles are read from any
claim named `roles`, or ending in `/roles` (such as `https://che.bot/roles`).

Configuration of a deployment:

- Secrets: `AI_GATEWAY_API_KEY`, `JOBS_URL`, `JOBS_TOKEN`, `AUTH0_DOMAIN`, `AUTH0_AUDIENCE`.
- Variables (`wrangler.jsonc`): `DAILY_CAP_USD` (the spend of a UTC day over every run),
  `LAUNCHED`, `RUN_BUDGET_USD` (empty: the protocol's default).
- Bindings: the D1 database `chebot-web` (its id in `wrangler.jsonc`, migrations with
  `wrangler d1 migrations apply chebot-web --remote`), the `RunObject` and `SpendMeter` classes, and
  the `ASK_LIMITER` rate limit (5 questions per user and minute).
- The payment hook is the origin of the `pay` request plus `/api/pay/hook`: the hostname the user
  reached, which must be https for the jobs service.
