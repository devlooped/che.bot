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
- `apps/web`: Worker, Durable Object and React app (later).
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
