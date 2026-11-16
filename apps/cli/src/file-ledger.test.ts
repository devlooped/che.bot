import { appendFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import type { LedgerEntry } from "./driver.ts";
import { fileLedger } from "./file-ledger.ts";

const entry = (key: string, costUsd: number): LedgerEntry => ({
  result: { status: "abstained", key, reason: "timeout", costUsd, latencyMs: 10 },
  seat: "grok",
  model: { id: "spacexai/grok-4.7", effort: "low" },
  error: "timed out",
  usage: null,
});

test("a file ledger reopened keeps every entry; the last of a key wins; a cut line is ignored", async () => {
  const file = join(mkdtempSync(join(tmpdir(), "chebot-ledger-")), "ledger.jsonl");
  const first = fileLedger(file);
  await first.put("draft:0:grok", entry("draft:0:grok", 0.01));
  await first.put("merge:0", entry("merge:0", 0.02));
  await first.put("merge:0", entry("merge:0", 0.03));
  appendFileSync(file, '{"key":"round:1:grok","entry":{"res');
  const reopened = fileLedger(file);
  expect([...reopened.entries.keys()]).toEqual(["draft:0:grok", "merge:0"]);
  expect((await reopened.get("merge:0"))?.result.costUsd).toBe(0.03);
  expect(await reopened.get("round:1:grok")).toBeUndefined();
});
