import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Classification, FakeProvider } from "@chebot/providers";
import { describe, expect, test } from "vitest";
import { type AskArgs, type AskDeps, ask, parseAskArgs } from "./ask.ts";
import { CATALOG, script } from "./fake-script.ts";

function deps(cls: "simple" | "complex", probability = 0.9): AskDeps & { provider: FakeProvider } {
  let t = 1_800_000_000_000;
  const classification: Classification = {
    class: cls,
    choice: cls,
    probability,
    usage: { inputTokens: 10, outputTokens: 1 },
    costUsd: 0.0002,
    latencyMs: 300,
  };
  return {
    provider: new FakeProvider(script()),
    catalog: async () => CATALOG,
    classify: async () => classification,
    now: () => (t += 100),
    runId: () => "0f8e7d6c-0000-4000-8000-000000000000",
    progress: () => {},
  };
}

const args = (extra: Partial<AskArgs> = {}): AskArgs => ({
  question: "¿Cuál es la capital de Australia?",
  mode: "thorough",
  maxUsd: null,
  out: mkdtempSync(join(tmpdir(), "chebot-ask-")),
  ...extra,
});

describe("parseAskArgs", () => {
  test("reads the question, --mode, --max-usd and --out", () => {
    expect(parseAskArgs(["¿Qué", "hora", "es?", "--mode", "quick", "--max-usd", "0.5"])).toEqual({
      question: "¿Qué hora es?",
      mode: "quick",
      maxUsd: 0.5,
      out: ".runs",
    });
    expect(parseAskArgs(["hola", "--out", "x"])).toMatchObject({
      mode: "thorough",
      maxUsd: null,
      out: "x",
    });
  });

  test("rejects a missing question, an unknown mode or budget, and unknown options", () => {
    expect(parseAskArgs([])).toHaveProperty("error");
    expect(parseAskArgs(["hola", "--mode", "slow"])).toHaveProperty("error");
    expect(parseAskArgs(["hola", "--max-usd", "-1"])).toHaveProperty("error");
    expect(parseAskArgs(["hola", "--max-usd", "mucho"])).toHaveProperty("error");
    expect(parseAskArgs(["hola", "--fast"])).toHaveProperty("error");
  });
});

describe("ask", () => {
  test("--max-usd is the budget of the run", async () => {
    const result = await ask(args({ maxUsd: 0.75 }), deps("simple"));
    expect(result.run?.state.config.budgetUsd).toBe(0.75);
    const started = result.run?.log.find((e) => e.type === "run.started");
    expect(started).toMatchObject({ budgetUsd: 0.75 });
  });

  test("every class runs the full process; the class is printed with its probability", async () => {
    for (const cls of ["simple", "complex"] as const) {
      const result = await ask(args(), deps(cls, 0.82));
      expect(result.mode).toBe("thorough");
      expect(result.run?.state.mode).toBe("thorough");
      expect(Object.keys(result.run?.state.calls ?? {}).some((k) => k.startsWith("round"))).toBe(
        true,
      );
      expect(result.message).toContain(
        `Class: ${cls} (${cls}, p=0.82) (sets the price); mode thorough`,
      );
      expect(result.code).toBe(0);
    }
  });

  test("--mode quick stops after the merge", async () => {
    const result = await ask(args({ mode: "quick" }), deps("complex"));
    expect(result.run?.state.mode).toBe("quick");
    expect(result.run?.state.stage).toBe("done");
    expect(Object.keys(result.run?.state.calls ?? {}).some((k) => k.startsWith("round"))).toBe(
      false,
    );
    expect(result.message).toContain("mode quick");
  });

  test("a failed classifier counts the question as complex and still runs it", async () => {
    const d = deps("simple");
    d.classify = async () => {
      throw new Error("down");
    };
    const result = await ask(args(), d);
    expect(result.mode).toBe("thorough");
    expect(result.code).toBe(0);
    expect(result.message).toContain("the classifier failed");
  });

  test("records the snapshot, writes the event log and one call log line per call, prints the answer", async () => {
    const result = await ask(args(), deps("complex"));
    const state = result.run?.state;
    if (!state || !result.dir) throw new Error("no run");
    expect(state.models["panel.grok"]).toEqual({ id: "spacexai/grok-4.7", effort: "low" });
    const lines = (file: string) =>
      readFileSync(join(result.dir as string, file), "utf8")
        .trim()
        .split("\n")
        .map((l) => JSON.parse(l));
    const events = lines("events.jsonl");
    expect(events).toEqual(result.run?.log);
    const calls = lines("calls.jsonl");
    expect(calls.map((c) => c.key).sort()).toEqual(Object.keys(state.calls).sort());
    expect(
      lines("ledger.jsonl")
        .map((l) => l.key)
        .sort(),
    ).toEqual(Object.keys(state.calls).sort());
    expect(calls[0]).toMatchObject({
      key: "draft:0:grok",
      seat: "grok",
      model: "spacexai/grok-4.7",
      status: "ok",
      costUsd: 0.05,
      inputTokens: 100,
      outputTokens: 50,
    });
    for (const text of [
      "spacexai/grok-4.7",
      "Class: complex (complex, p=0.90) (sets the price); mode thorough",
      "Answer (version 4)",
      "majority, 3 de 4",
      "Dissent notes",
      "src1 Canberra <https://example.org/canberra>",
      "Moments",
      "Los cuatro están trabajando.",
      "Abstained: none",
      "Flags: none",
      "Cost: US$0.",
      "Time: ",
    ]) {
      expect(result.message).toContain(text);
    }
  });

  test("a failed run exits non-zero", async () => {
    const d = deps("simple");
    d.provider = new FakeProvider({ respond: () => ({ kind: "error" }) });
    const result = await ask(args(), d);
    expect(result.run?.state.status).toBe("failed");
    expect(result.code).toBe(1);
    expect(result.message).toContain("Status: failed (no_drafts)");
  });
});
