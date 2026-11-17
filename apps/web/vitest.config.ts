import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// The tests run inside the Workers runtime, with the bindings of wrangler.jsonc, local D1 and
// Durable Objects, and no network: the providers, the catalog, the classifier, the jobs service and
// the keys of the tenant are replaced in each test (see src/worker/deps.ts).
export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations(path.join(import.meta.dirname, "migrations")),
          AI_GATEWAY_API_KEY: "",
          JOBS_URL: "https://jobs.invalid",
          JOBS_TOKEN: "",
          AUTH0_DOMAIN: "chebot-test.auth0.invalid",
          AUTH0_AUDIENCE: "https://api.chebot.test",
          DAILY_CAP_USD: "20",
          LAUNCHED: "false",
        },
      },
    })),
  ],
  // The app's own tests run in Node (vitest.app.config.ts).
  test: { include: ["test/**/*.test.ts"], setupFiles: ["./test/apply-migrations.ts"] },
});
