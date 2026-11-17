// Test support: the scripted runs of the local mode, played through the driver and the real
// renderer in Node, for the tests of the local script and of the chart view.
import { chartRenderer } from "@chebot/charts";
import { drive, startRun } from "@chebot/driver";
import { replay } from "@chebot/protocol";
import { FakeProvider } from "@chebot/providers";
import { LOCAL_RUN_CONFIG } from "./config.ts";
import { scenario } from "./scenario.ts";

const MODELS = {
  "panel.grok": { id: "spacexai/grok-4.7", effort: "low" },
  "panel.claude": { id: "anthropic/claude-opus-5.5", effort: "medium" },
  "panel.openai": { id: "openai/gpt-6.1-sol", effort: "medium" },
  "panel.gemini": { id: "google/gemini-4-argon", effort: "medium" },
  utility: { id: "anthropic/claude-haiku-5.5", effort: null },
};

/** Plays a run of the local mode through the driver and the real renderer. */
export async function playChart(question: string) {
  const run = startRun(
    {
      id: crypto.randomUUID(),
      question,
      mode: "thorough",
      models: MODELS,
      config: LOCAL_RUN_CONFIG,
    },
    Date.now(),
  );
  const driven = await drive(run, {
    provider: new FakeProvider(scenario()),
    renderer: chartRenderer,
  });
  return replay(driven.log);
}
