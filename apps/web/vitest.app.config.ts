import { defineConfig } from "vitest/config";

// The tests of the browser app and of the local mode's script, in Node (the Worker's tests run in
// the Workers runtime, see vitest.config.ts).
export default defineConfig({
  test: {
    include: ["src/app/**/*.test.ts", "src/local/**/*.test.ts", "scripts/**/*.test.ts"],
  },
});
