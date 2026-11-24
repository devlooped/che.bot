---
title: "Fix the margin marks standing 2.6px right of the seats' marks (failing e2e test)"
kind: problem
status: pending
created: 2026-11-24
summary: "The e2e test 'a click on a margin mark opens its discussion' fails on main, on phone and desktop: the margin marks are no longer in line with the marks of the seats."
---

## Why

`pnpm --filter @chebot/web exec playwright test run.spec.ts -g "margin mark"` fails on `main` (f23e16f) with no local change, in both projects:

- `e2e/run.spec.ts:54`: `expect(left('[data-testid="mark"] svg')).toBeCloseTo(left(".seat svg"), 0)`
- desktop: expected 199, received 201.6875; phone: a difference of 2.546875.

The rest of the suite passes (64 passed, 2 skipped). The assertion was added in 89fc3da ("Line the margin marks up with the marks of the seats"); the next commit, f23e16f ("the whole margin opens a vote"), changed the gutter of a marked paragraph in `styles.css` (it removed `padding-right: 0.3rem` and moved the mark's `margin-top` into its padding), which is the likely cause.

## What to do

Find why the first mark of a paragraph now stands about 2.6px right of the seats' marks and bring the two back in line (or, if the new place is intended, correct the test and the comment of `--gutter`).

## Where

- `apps/web/src/app/styles.css`: `--gutter`, the rules of the marked paragraph's gutter and of `.seat`
- `apps/web/e2e/run.spec.ts:51-54`
