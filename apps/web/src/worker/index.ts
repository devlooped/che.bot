import { handle } from "./api.ts";
import type { Env } from "./env.ts";

export { RunObject } from "./run-object.ts";
export { SpendMeter } from "./spend-meter.ts";

// One Worker: /api/* reaches it (see run_worker_first in wrangler.jsonc); the static assets of the
// single-page app answer every other path.
export default {
  fetch: (request, env) => handle(request, env),
} satisfies ExportedHandler<Env>;
