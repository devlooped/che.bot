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
payment and calls the hook), and a sign-in that picks a test user (beta, admin, or no access). The
production entry never imports `src/local`, and `pnpm build` fails if anything of it is in the
output (`scripts/check-build.mjs`).

The end-to-end tests start the local mode themselves. They need Playwright's Chromium
(`pnpm --filter @chebot/web exec playwright install chromium`) or a browser of the machine:
`PLAYWRIGHT_CHANNEL=msedge` (or `chrome`).

The browser app signs in with the Auth0 SPA SDK, configured by public build variables:
`VITE_AUTH0_DOMAIN`, `VITE_AUTH0_CLIENT_ID` and `VITE_AUTH0_AUDIENCE` (see `apps/web/.env.example`).

| Route                                                                | Who may call it                                                    |
| -------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `POST /api/runs {question}` → `201 {runId, class, amount, currency}` | signed in; the `admin` or `beta` role until `LAUNCHED` is `"true"` |
| `POST /api/runs/:id/pay` → `202`                                     | the owner; an `admin` owner runs free, with no payment job         |
| `POST /api/runs/:id/rerun` → `202`                                   | the owner, once, after a paid run failed                           |
| `DELETE /api/runs/:id`                                               | the owner or an admin                                              |
| `GET /api/runs/:id`, `/events?after=`, `/ws?after=`, `/snapshots/:v` | anyone with the link (`mine` in the summary: the caller owns it)   |
| `GET /api/me/runs`                                                   | signed in                                                          |
| `GET`, `PUT /api/admin/models`, `/api/admin/prices`                  | `admin`                                                            |
| `POST /api/pay/hook`                                                 | the jobs service, with the run's own token as Bearer               |

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
