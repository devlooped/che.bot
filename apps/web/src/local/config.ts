import type { ConfigOverrides } from "@chebot/protocol";

/**
 * The run configuration of the local mode: short timeouts, so that the model that does not answer
 * in the last round (see scenario.ts) gives up in seconds, not in 4 minutes.
 */
export const LOCAL_RUN_CONFIG: ConfigOverrides = {
  callTimeoutMs: { draft: 10_000, merge: 10_000, round: 4_000, editor: 8_000, utility: 4_000 },
};
