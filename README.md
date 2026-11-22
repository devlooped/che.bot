# che.bot

A web app where four AI models (Grok, Claude, OpenAI, Gemini) each draft an answer alone, then converge on one answer through a fixed, code-run protocol of tracked suggestions and votes over a shared document. Signed-in users pay per question by QR.

The full plan: [.alta/plans/2026-11-16-consensus-answers.md](.alta/plans/2026-11-16-consensus-answers.md).

## Build order

0. **Scaffold**: pnpm TypeScript workspace (this repository state).
1. **Protocol**: the protocol as a headless script, and its evaluation on about 50 questions (does it beat the best single model?).
2. **Runtime**: the Cloudflare Durable Object runtime, sign-in, payment and the event stream.
3. **UI**: the Spanish (rioplatense) UI over the event stream.
4. **Charts**: charts as blocks of the answer, chosen by the drafts ([the plan](.alta/plans/2026-11-17-charts-inside-answers.md)).

## Layout

- `packages/protocol`: types, schemas, reducer, prompts. No I/O.
- `packages/providers`: model providers, roles, families, catalog.
- `packages/driver`: the loop that makes the calls of a step through a ledger (CLI and `RunObject`).
- `packages/charts`: the render gate of the charts: Vega-Lite to SVG in Vega's interpreter mode.
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

# An answer with charts: when two drafts or more chart the same measure (found on the web, each
# value with its citation), the answer has that chart among its paragraphs, up to 3. For each chart
# it writes chart-<id>.vl.json (the Vega-Lite spec, data and theme included), rows-<id>.json (the
# rows with their sources and disputes) and chart-<id>-v<N>.svg (every version) next to the logs,
# and prints the rows, the disputes and the charts proposed and not drawn.
pnpm cli ask "¿Cuál fue la inflación mensual de Argentina en 2026?" --max-usd 3

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
pnpm --filter @chebot/web dev:live  # real services, on http://localhost:3000: apps/web/.dev.vars, see below
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
sign-in that picks a test user (`Contrib`, `Admin`, or no role) and sets the same session cookie as
the real sign-in (`POST /api/local/sign-in`; "Salir" only clears it). The production entry never imports
`src/local`, and `pnpm build` fails if anything of it is in the output (`scripts/check-build.mjs`).

Its drafts propose no chart. `CHART_QUESTION` of `src/local/chart-scenario.ts` ("¿Cuánto fue la
inflación de cada mes del primer semestre de 2025, y cómo le fue al salario?", with anything after
it) plays a run whose answer has two charts among its two paragraphs, through the real renderer:
the monthly inflation of the first half of 2025, which the four drafts chart, and the wages, which
two chart alike; a chart of the dollar that only Claude proposes is left out.

The states around the happy path are played the same way, to see and test them:

| To see                                   | Do                                                                                                                      |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| A run that fails, and its free rerun     | Ask with `[falla]` in the question and pay: no model answers the drafts the first time, so the rerun plays the full run |
| Fewer than three answers                 | Ask with `[pocas]`: Grok and Gemini do not answer the drafts                                                            |
| The budget reached before the discussion | Ask with `[presupuesto]`: the drafts spend nearly all of it                                                             |
| An expired payment                       | "Simular que venció el QR" under the QR (`POST /api/local/expire/:id`)                                                  |
| A model that does not answer             | Every run: Gemini misses the last round of votes                                                                        |
| Charts among the paragraphs              | Ask `CHART_QUESTION`: inflation after the first paragraph, wages after the second                                       |
| A chart: agreed rows                     | The inflation chart: January, February and April; every row of the wages                                                |
| A point corrected by its source          | The inflation chart: March, drawn at 3,3 (two models) and settled at 3,7 by the statistics office                       |
| A point drawn as a range                 | The inflation chart: May, 1,5 and 1,9, neither source held up                                                           |
| A value of one model, not confirmed      | The inflation chart: June, Gemini's alone                                                                               |
| Voted layers, and one without agreement  | The inflation chart: the title and the explanation accepted, bars instead of the line two against two                   |
| Earlier versions of the charts           | "Cómo cambió la respuesta" on a finished answer: three versions, the marks of each chart moving                         |

The pages: `/` asks, `/r/:id` follows a run and replays how its text and its charts formed,
`/mis-preguntas` lists
the user's questions (copy a link, delete one, restore a deleted one), and `/admin` sets the model
of each role and the two prices (admins only; the menu of the account hides it from others).

On the page of a run, its owner asks the question again or deletes it. Asking again is a new run of
the same text, quoted and paid as any other, with the models of today; once it starts, the old run
is deleted and its link leads to the new one. A deleted run stays (`deleted_at` in the list, see
`migrations/0003_run_deleted.sql`): its owner still reads it and may restore it, and anyone else
is told that its author deleted it (410).

A run is a UUID inside: its object, its payment job, its row in the list. Once it is paid and
starts, the helper model (Claude Haiku at medium effort by default) sums the question up in at
most five words, its own or the question's, and the run gets its public link: the second it was asked, counted from the QuaranTime
epoch (2020-03-20 00:00 at GMT-03:00) in Base62, then the words, such as
`/r/EEIHf-cuanto-mide-el-aconcagua-hoy`. A unique index of the list claims the link; in the rare
case that another question of the same second has the same words, the next second is tried.
`/r/<uuid>` and the short link alone (`/r/EEIHf`) redirect to the link for good (301).

The end-to-end tests start the local mode themselves. They need Playwright's Chromium
(`pnpm --filter @chebot/web exec playwright install chromium`) or a browser of the machine:
`PLAYWRIGHT_CHANNEL=msedge` (or `chrome`). They run at a phone width and a desktop width, and
`e2e/a11y.spec.ts` checks the main pages and states with axe (WCAG 2.1 A and AA, and its best
practices). The server of the tests keeps its own state (prices, models, runs) in
`apps/web/.wrangler/e2e-state`, emptied at each start, so a run begins from the default prices and
models and never touches the state of `pnpm --filter @chebot/web dev` (`.wrangler/state`).

`dev:live` runs the real Worker against the real services on http://localhost:3000, whose
`/auth/callback` the Auth0 application allows. Its `apps/web/.dev.vars` (see `.dev.vars.example`)
needs `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET` and `SESSION_SECRET` to sign in,
`AI_GATEWAY_API_KEY` to ask, and `JOBS_URL` and `JOBS_TOKEN` to pay (the jobs service calls the
hook back on the origin of the page, which it cannot reach on localhost).

| Route                                                                | Who may call it                                                       |
| -------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `GET /auth/login?returnTo=/path`, `/auth/callback`, `/auth/logout`   | anyone: the sign-in, see below                                        |
| `GET /api/me` → `{id, name, admin, mayAsk}` or `null`                | anyone: the signed-in user                                            |
| `POST /api/runs {question, replaces?}` → `201 {runId, class, amount, currency}` | signed in; the `Admin` or `Contrib` role until `LAUNCHED` is `"true"`; `replaces`, a run of theirs |
| `POST /api/runs/:id/pay` → `202`                                     | the owner; an `Admin` owner runs free, with no payment job            |
| `POST /api/runs/:id/rerun` → `202`                                   | the owner, once, after a paid run failed                              |
| `DELETE /api/runs/:id`                                               | the owner, who may restore it; an admin, for good                     |
| `POST /api/runs/:id/restore` → `204`                                 | the owner, after deleting it                                          |
| `GET /api/runs/:id`, `/events?after=`, `/ws?after=`, `/snapshots/:v` | anyone with the link (`mine` in the summary: the caller owns it); a deleted run, its owner only (`410` for anyone else) |
| `GET /api/runs/:id/charts/:chart/:v.svg`                             | anyone with the link: the render of a chart (`c1`) at version `v`     |
| `GET /api/me/runs`                                                   | signed in                                                             |
| `GET`, `PUT /api/admin/models`, `/api/admin/prices`                  | `Admin`                                                               |
| `POST /api/pay/hook`                                                 | the jobs service, with the run's own token as Bearer                  |

Nobody asks for a chart: the drafts propose them, and the summary of a run says how many charts its
answer has (`charts`).

The render gate of the charts runs inside `RunObject`. Step 36 measured it in the Workers runtime:
Vega in interpreter mode renders a chart in 35 ms the first time and 7 ms after (without the
interpreter Vega fails there with "Code generation from strings disallowed"); its packages add
851 KiB minified (296 KiB gzip), whose evaluation takes 40-110 ms of the 1 s startup limit. The
production build puts them in a chunk of their own that `RunObject` imports on its first render, so
a Worker that only answers the API never evaluates it; the whole upload is 2,545 KiB (631 KiB gzip).

The page of a run (step 41) draws each chart of the answer, in its place among the paragraphs, with `vega-embed` (no interpreter: the browser may
compile expressions), loaded with a dynamic import by `ChartCanvas`, so a text answer never downloads
it: the browser chunk of the chart is 854 KB minified (294 KB gzip), beside 429 KB (132 KB gzip)
for the rest of the app. The spec of the page (`src/app/chart/spec.ts`) is the chart's layers and
fixed theme, with the title out of the drawing (it is a heading), a named data
set, the range of an unsettled row with both its ends, and the number of the note of
every corrected, disputed or unconfirmed point. A new version with the same layers moves the marks:
the data set is tweened frame by frame (`src/app/chart/embed.ts`); a version whose kind, axes or
calculation changed is drawn again, faded in; with reduced motion every change is immediate. Under
the chart, the table is its text: every row with its value, its source and the words that state it,
and a note on each corrected point (what it was, what it is, the source that settled it, who said
what), on each range (both values and their sources) and on each value no source confirmed. The
layers the models voted on (the kind of chart, the title, the
explanation, the calculation) open their discussions like the paragraphs of a text.

Sign-in happens in the Worker (`src/worker/auth0.ts`), with the authorization code flow of the
regular web application of the existing app's Auth0 tenant. `/auth/login` redirects to the
tenant's `/authorize` (scope `openid profile email`, state, nonce and PKCE S256, kept 10 minutes in
the signed, httpOnly `__Host-chebot_login` cookie; `returnTo` is kept only when it is a path of
this origin). `/auth/callback` checks the state, exchanges the code with the client secret and the
code verifier, and verifies the ID token (RS256 against the tenant's JWKS, issuer
`https://AUTH0_DOMAIN/`, audience `AUTH0_CLIENT_ID`, nonce, expiry); the roles are every claim named
`roles` or `role`, or ending in `/roles` (such as `https://che.bot/roles`), of the ID token and of
the access token when it is a JWT of the tenant. A failed sign-in comes back to `/?signin=failed`.
`/auth/logout` clears the session and goes to the tenant's `/v2/logout`, which comes back to the
origin. The Auth0 application must allow `<origin>/auth/callback` as a callback URL and `<origin>`
as a logout URL, for every origin that serves the app.

The session (`src/worker/session.ts`) is a token signed with `SESSION_SECRET` (HS256) in the
`__Host-chebot_session` cookie: httpOnly, Secure, SameSite=Lax, Path=/, for 3 days from the
sign-in, with no server-side store (on http://localhost the cookies lose the prefix and the Secure
flag). It carries the user's id, name and roles as they were at the sign-in. A cookie that is
tampered, expired or signed with another secret is no user. Roles are matched exactly: `Admin` is
the admin, and until `LAUNCHED` only `Admin` and `Contrib` may ask (`admin` is neither). Because
the identity is a cookie, every request under `/api` that is not a GET or HEAD must come from a
page of the same origin (its `Origin`, or `Sec-Fetch-Site: same-origin`) or is refused with 403;
`/api/pay/hook`, which carries the run's own token, is the exception.

Configuration of a deployment:

- Secrets: `AI_GATEWAY_API_KEY`, `JOBS_URL`, `JOBS_TOKEN`, `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`,
  `AUTH0_CLIENT_SECRET`, `SESSION_SECRET` (at least 32 random characters; changing it signs
  everyone out).
- Variables (`wrangler.jsonc`): `DAILY_CAP_USD` (the spend of a UTC day over every run),
  `LAUNCHED`, `RUN_BUDGET_USD` (empty: the protocol's default).
- Account and bindings (`wrangler.jsonc`): the Cloudflare account `c1d5bf025f41490ee30de77958f9fa35`;
  the D1 database `chebot` (binding `DB`, migrations with `wrangler d1 migrations apply chebot --remote`), the `RunObject` and `SpendMeter` classes, and
  the `ASK_LIMITER` rate limit (5 questions per user and minute).
- Deployment: every push to `main` runs `.github/workflows/deploy.yml`, which checks, builds,
  applies the D1 migrations and runs `wrangler deploy`, with the repository secret
  `CLOUDFLARE_API_TOKEN` (Workers Scripts: Edit and D1: Edit on the account).
- The payment hook is the origin of the `pay` request plus `/api/pay/hook`: the hostname the user
  reached, which must be https for the jobs service.
