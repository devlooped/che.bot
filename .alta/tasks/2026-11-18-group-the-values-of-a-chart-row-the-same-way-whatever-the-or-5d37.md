---
title: "Group the values of a chart row the same way whatever the order of the models"
kind: improvement
status: pending
created: 2026-11-18
summary: "buildRow puts a value in the first group it is the same as, in the order of the models, so a rounded value that fits two groups (76 between 76.023 and 75.848) supports whichever came first."
---

## Why

- `buildRow` in `packages/protocol/src/chart-run.ts` goes through the values in the order of the models and adds each to the first group whose first value is the same (`sameValue`). "The same by rounding" is not transitive: a coarse value can be the same as two values that differ from each other.
- Verified on 2026-11-18 with `sameValue` and that grouping: `[76.023, 75.848, 76, 76.02]` gives `[76.023, 76, 76.02]` and `[75.848]`, but without the first value `[75.848, 76, 76.02]` gives `[75.848, 76]` and `[76.02]`. These are the values of Brasil in the run `c04` of 2026-11-17: had Grok abstained, ChatGPT's 76.0 (data of 2024) would have counted as support for Claude's 75.848 (data of 2023) and made it the main value.
- It is older than the rule for integers: `[77.46, 77.5, 77.54]` gives `[77.46, 77.5]`, `[77.54]`, and in the other order `[77.54, 77.5]`, `[77.46]`.

## What to do

- Place the finer values first (most decimals, then the order of the models) and add a value to the group whose value is closest among those it is the same as.
- Keep what the order of the models decides today: which group is the main one when two have the same support, and which entry of a group gives its source and quote.
- The same grouping is done for the values of data patches in `placeDataPatches`; use one function for both if it stays simple.

## Where

- `packages/protocol/src/chart-run.ts` (`buildRow`, `placeDataPatches`), `packages/protocol/src/chart-run.test.ts`.
