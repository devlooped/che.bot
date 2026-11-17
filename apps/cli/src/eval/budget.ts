import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { CallLedger, LedgerEntry } from "@chebot/driver";
import {
  type GenerateRequest,
  type GenerateResult,
  type ModelProvider,
  ProviderError,
} from "@chebot/providers";
import { fileLedger } from "../file-ledger.ts";

// The spend of the whole evaluation. Every model call goes through a gate that reserves the call's
// worst case before it starts and refuses it once the cap would be passed; a refused call never
// reaches the provider and never reaches a ledger, so a later invocation makes it.

export type SpendKind = "runs" | "classify" | "judging";

/** The files a question keeps under the raw directory, by what they hold. */
export const RAW_FILES = {
  run: "run.jsonl",
  editor: "editor-rotation.jsonl",
  judge: "judge.jsonl",
  classify: "classify.json",
} as const;

export class Budget {
  readonly spent: Record<SpendKind, number>;
  /** Spent by this invocation, on calls actually made. */
  readonly live: Record<SpendKind, number> = { runs: 0, classify: 0, judging: 0 };
  private reserved = 0;
  /** Set once a call was refused: nothing new starts after it. */
  stopped: boolean;

  constructor(
    readonly capUsd: number,
    prior: Record<SpendKind, number>,
    options: { stopped?: boolean } = {},
  ) {
    this.spent = { ...prior };
    this.stopped = options.stopped ?? false;
  }

  total(): number {
    return this.spent.runs + this.spent.classify + this.spent.judging;
  }

  /** Reserves the worst case of a call; false (and stopped from then on) when it does not fit. */
  reserve(worstUsd: number): boolean {
    if (this.stopped) return false;
    if (this.total() + this.reserved + worstUsd > this.capUsd + 1e-9) {
      this.stopped = true;
      return false;
    }
    this.reserved += worstUsd;
    return true;
  }

  settle(worstUsd: number, actualUsd: number, kind: SpendKind) {
    this.reserved = Math.max(0, this.reserved - worstUsd);
    const cost = Number.isFinite(actualUsd) ? actualUsd : 0;
    this.spent[kind] += cost;
    this.live[kind] += cost;
  }
}

/** Thrown for a call the gate refused: the cap is reached, or the invocation makes no calls. */
export class CallRefused extends Error {
  override readonly name = "CallRefused";
}

/**
 * A provider and a ledger for one drive (a run, its editor variant, or the judging of a question).
 * A call refused by the budget is recorded nowhere and aborts `signal`, so the drive stops at the
 * end of the step and its state is discarded; `refused` says that happened.
 */
export interface Guarded {
  provider: ModelProvider;
  ledger: CallLedger;
  signal: AbortSignal;
  refused: () => boolean;
}

export function guard(input: {
  provider: ModelProvider;
  budget: Budget;
  kind: SpendKind;
  /** The ledger file; created with its directory on the first call that lands. */
  file: string;
  worstUsd: (callKey: string) => number;
  onSpend?: (callKey: string, costUsd: number) => void;
}): Guarded {
  const { budget, kind } = input;
  const refusedKeys = new Set<string>();
  const controller = new AbortController();
  const inner = fileLedger(input.file);
  const provider: ModelProvider = {
    async generate<T>(req: GenerateRequest<T>): Promise<GenerateResult<T>> {
      const worst = input.worstUsd(req.callKey);
      if (!budget.reserve(worst)) {
        refusedKeys.add(req.callKey);
        controller.abort();
        throw new CallRefused(`${req.callKey}: not made (the spending cap is reached)`);
      }
      try {
        const out = await input.provider.generate(req);
        budget.settle(worst, out.costUsd, kind);
        input.onSpend?.(req.callKey, out.costUsd);
        return out;
      } catch (error) {
        const cost = ProviderError.isInstance(error) ? (error.costUsd ?? 0) : 0;
        budget.settle(worst, cost, kind);
        input.onSpend?.(req.callKey, cost);
        throw error;
      }
    },
  };
  const ledger: CallLedger = {
    get: (key) => inner.get(key),
    put: async (key, entry) => {
      if (refusedKeys.has(key)) return;
      mkdirSync(dirname(input.file), { recursive: true });
      await inner.put(key, entry);
    },
  };
  return {
    provider,
    ledger,
    signal: controller.signal,
    refused: () => refusedKeys.size > 0,
  };
}

/** What earlier invocations spent, from every ledger under the raw directory of the set. */
export function priorSpend(raw: string): Record<SpendKind, number> {
  const spent: Record<SpendKind, number> = { runs: 0, classify: 0, judging: 0 };
  if (!existsSync(raw)) return spent;
  const sum = (file: string) =>
    [...fileLedger(file).entries.values()].reduce(
      (total, e: LedgerEntry) => total + (Number.isFinite(e.result.costUsd) ? e.result.costUsd : 0),
      0,
    );
  for (const entry of readdirSync(raw, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = join(raw, entry.name);
    spent.runs += sum(join(dir, RAW_FILES.run)) + sum(join(dir, RAW_FILES.editor));
    spent.judging += sum(join(dir, RAW_FILES.judge));
    const classified = join(dir, RAW_FILES.classify);
    if (existsSync(classified)) {
      try {
        spent.classify += (
          JSON.parse(readFileSync(classified, "utf8")) as { costUsd: number }
        ).costUsd;
      } catch {
        // a file cut short: its call is made again
      }
    }
  }
  return spent;
}
