// The types of `env` and `exports` of cloudflare:workers in the tests: the Worker's bindings and
// main module, and the migrations that vitest.config.ts reads.
type WorkerEnv = import("../src/worker/env.ts").Env;

declare namespace Cloudflare {
  interface Env extends WorkerEnv {
    TEST_MIGRATIONS: import("cloudflare:test").D1Migration[];
  }
  interface GlobalProps {
    mainModule: typeof import("../src/worker/index.ts");
    durableNamespaces: "RunObject" | "SpendMeter";
  }
}
