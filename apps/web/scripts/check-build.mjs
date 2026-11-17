// Fails the production build when anything of the local mode reached it: the fakes of
// src/local (provider, jobs, sign-in) carry LOCAL_MODE_MARKER, and a deployable Worker must
// start from src/worker/index.ts. Run after `vite build` (see the build script).
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const MARKER = "chebot-local-mode-fakes";
const dist = path.join(import.meta.dirname, "..", "dist");

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? files(full) : [full];
  });
}

let all;
try {
  all = files(dist);
} catch {
  console.error(`check-build: no build output in ${dist}.`);
  process.exit(1);
}
const leaks = all.filter(
  (file) => /\.(m?js|json|html)$/.test(file) && readFileSync(file, "utf8").includes(MARKER),
);
const configs = all.filter((file) => path.basename(file) === "wrangler.json");
const local = configs.filter(
  (file) => JSON.parse(readFileSync(file, "utf8")).name !== "chebot-web",
);

if (leaks.length > 0 || local.length > 0 || configs.length === 0) {
  for (const file of leaks)
    console.error(`check-build: the local mode is in ${path.relative(dist, file)}.`);
  for (const file of local)
    console.error(`check-build: ${path.relative(dist, file)} is not the production Worker.`);
  if (configs.length === 0) console.error("check-build: no Worker config in the build output.");
  process.exit(1);
}
console.log(`check-build: ${all.length} files, no local mode.`);
