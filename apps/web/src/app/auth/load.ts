import type { Auth } from "./types.ts";

/**
 * The sign-in of this build. `import.meta.env.MODE` is a constant of the build: in a production
 * build the branch of the local mode is dead code and its module is not bundled (the build checks
 * it, see scripts/check-build.mjs). No variable of a deployed app can switch it on.
 */
export async function loadAuth(): Promise<Auth> {
  if (import.meta.env.MODE === "fakes")
    return (await import("../../local/client.tsx")).createLocalAuth();
  return (await import("./auth0.ts")).createAuth();
}
