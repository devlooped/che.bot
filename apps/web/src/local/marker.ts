/**
 * A string that only the local mode contains. The production build is checked for it
 * (scripts/check-build.mjs): finding it means a fake reached a bundle that could be deployed.
 */
export const LOCAL_MODE_MARKER = "chebot-local-mode-fakes";
