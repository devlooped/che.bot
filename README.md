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
- `eval/`: the question set and reports (later).

## Usage

Requires Node 22+ and pnpm 10.

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm lint
pnpm cli ask "your question"
```
