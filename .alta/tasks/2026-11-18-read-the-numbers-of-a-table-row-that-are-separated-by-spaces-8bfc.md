---
title: "Read the numbers of a table row that are separated by spaces"
kind: problem
status: pending
created: 2026-11-18
summary: "numbersIn reads a quote such as \"Canada 4,820 5,600 1,600,000\" as one text that is no number, so quoteStates says the quote does not state a value it does state, and the row ends unverified."
---

## Why

- `numbersIn` in `packages/protocol/src/chart.ts` matches a number with `/[-−]?\d[\d.,   ]*\d|\d/g`: spaces are allowed inside a number (for "1 234 567"), so the cells of a table row separated by spaces become one match, which `parseNumber` then refuses.
- Verified on 2026-11-18: `numbersIn("Canada 4,820 5,600 1,600,000")` and `numbersIn("Brasil 8.615.770 217.637 25,3 76,0")` return `[]`, while `numbersIn("Canada | 4,820 | 5,600 | 1,600,000")` returns the numbers.
- Effect in the live chart runs of 2026-11-17 (`.runs/charts10`, not in git): in `c07` the value of Canadá (1,600,000, quote "Canada 4,820 5,600 1,600,000") ended `unverified` with "quote does not state it"; in `c04` the values of ChatGPT for Brasil and Paraguay (quotes "Brasil 8.615.770 217.637 25,3 76,0" and "Paraguay 406.750 6.947 17,1 74,0") got the same verdict.

## What to do

- Make `numbersIn` read each number of such a row: a space joins two groups of digits only when what follows is a group of exactly three digits that continues a number written with spaces as thousands separators (as `parseNumber` already requires); otherwise the space ends the number.
- Add the three quotes above to the tests of `quoteStates`, and keep "1 234 567" read as one number.

## Where

- `packages/protocol/src/chart.ts` (`numbersIn`, `parseNumber`), `packages/protocol/src/chart.test.ts`.
