import type { LocalMode } from "./types.ts";

/**
 * The local mode's additions, or null in any other build. `import.meta.env.MODE` is a constant of
 * the build: in a production build the branch of the local mode is dead code and its module is not
 * bundled (the build checks it, see scripts/check-build.mjs). No variable of a deployed app can
 * switch it on.
 */
export async function loadLocalMode(): Promise<LocalMode | null> {
  if (import.meta.env.MODE === "fakes")
    return (await import("../../local/client.tsx")).createLocalMode();
  return null;
}
