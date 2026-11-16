import { appendFileSync, existsSync, readFileSync } from "node:fs";
import type { CallLedger, LedgerEntry } from "./driver.ts";

/**
 * A ledger in a JSON-lines file, one `{ key, entry }` per finished call, appended as each lands.
 * Reopening the file restores every entry, so a rerun of the same run never pays twice. A line
 * cut short by a crash is ignored; the last entry of a key wins.
 */
export function fileLedger(file: string): CallLedger & { entries: Map<string, LedgerEntry> } {
  const entries = new Map<string, LedgerEntry>();
  if (existsSync(file)) {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      if (line.trim() === "") continue;
      try {
        const row = JSON.parse(line) as { key: string; entry: LedgerEntry };
        entries.set(row.key, row.entry);
      } catch {
        // a partial last line
      }
    }
  }
  return {
    entries,
    get: async (key) => entries.get(key),
    put: async (key, entry) => {
      appendFileSync(file, `${JSON.stringify({ key, entry })}\n`);
      entries.set(key, entry);
    },
  };
}
