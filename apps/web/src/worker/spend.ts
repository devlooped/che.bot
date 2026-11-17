// The spend of one run so far, for admins (GET /api/runs/:id/spend): the cost the Gateway reported
// for each model call, summed overall and grouped by agent (the seat that made the call), model and
// stage. A call still in flight counts in `running` and has no cost yet; the classification of the
// question, made before the run, is the "classifier" agent.

export type SpendPivot = "agent" | "model" | "stage";

export interface SpendRow {
  label: string;
  /** Finished calls. */
  calls: number;
  /** Calls in flight. */
  running: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface RunSpend {
  totalUsd: number;
  calls: number;
  running: number;
  rows: Record<SpendPivot, SpendRow[]>;
}

/** One call: finished, with what it cost, or in flight. */
export interface SpendCall {
  agent: string;
  model: string;
  stage: string;
  running: boolean;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
}

/** The stage of a call key ("draft:0:grok", or "a2:round:1:grok" in a rerun): its first part. */
export function stageOfKey(key: string): string {
  return key.replace(/^a\d+:/, "").split(":")[0] ?? key;
}

const finite = (n: number) => (Number.isFinite(n) ? n : 0);

export function spendOf(calls: readonly SpendCall[]): RunSpend {
  const pivot = (by: SpendPivot) => {
    const groups = new Map<string, SpendRow>();
    for (const call of calls) {
      const label = call[by];
      const row = groups.get(label) ?? {
        label,
        calls: 0,
        running: 0,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
      };
      if (call.running) row.running++;
      else {
        row.calls++;
        row.inputTokens += finite(call.inputTokens);
        row.outputTokens += finite(call.outputTokens);
        row.costUsd += finite(call.costUsd);
      }
      groups.set(label, row);
    }
    return [...groups.values()].sort(
      (a, b) => b.costUsd - a.costUsd || a.label.localeCompare(b.label),
    );
  };
  const rows = { agent: pivot("agent"), model: pivot("model"), stage: pivot("stage") };
  return {
    totalUsd: rows.agent.reduce((sum, r) => sum + r.costUsd, 0),
    calls: rows.agent.reduce((sum, r) => sum + r.calls, 0),
    running: rows.agent.reduce((sum, r) => sum + r.running, 0),
    rows,
  };
}
