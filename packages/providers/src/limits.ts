// Starting values, tuned with the phase 1 measurements.
export const limits = {
  callTimeoutMs: { draft: 90_000, round: 45_000, editor: 60_000, utility: 20_000 },
  deadlineMs: { quick: 120_000, thorough: 240_000 },
  searchResultsPerDraft: 10,
};
