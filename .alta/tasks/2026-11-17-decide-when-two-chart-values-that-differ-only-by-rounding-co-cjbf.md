---
title: "Decide when two chart values that differ only by rounding count as the same"
kind: improvement
status: pending
created: 2026-11-17
summary: "In the ten live chart runs, rows ended as a disputed range for differences of rounding (6,961 against 6,960.8 m; 76 against 76.023 years), because an integer is never treated as equal to a decimal that rounds to it. The tolerance is a product choice."
---

## Why

- `sameValue` in `packages/protocol/src/chart.ts` treats two values as the same only when they are equal, or when both have decimals and agree at the coarser precision. Its comment says an integer is never the same as a rounded one, so that 3 and 3.4 stay different and the sources settle them.
- In the ten live chart questions of 2026-11-17 (`.runs/charts10/summary.json`, not in git) this left rows without agreement for differences of rounding: Aconcagua 6,961 against 6,960.8 m, Brazil's life expectancy 76 against 76.023, Paraguay 74 against 73.982. Each is drawn as a range and listed as "Sin acuerdo".
- Other ranges in those runs are real differences between sources (77.543 against 77.395, data of different years) and should stay.

## What to do

- Decide the rule with the user: for example, a value that rounds to the other at the other's precision counts as the same only when the relative difference is small (say under 0.5%), so that 6,961 and 6,960.8 agree while 3 and 3.4 do not.
- Change `sameValue` and its tests, and check the ten questions again from their ledgers.

## Where

- `packages/protocol/src/chart.ts` (`sameValue`, `quoteStates`), `packages/protocol/src/chart.test.ts`.
