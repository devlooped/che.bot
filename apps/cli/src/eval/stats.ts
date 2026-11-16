// The statistics of the evaluation: small, exact helpers over plain numbers and votes.

export function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** The middle value; the mean of the two middle values for an even count. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[mid] as number)
    : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

/** The nearest-rank percentile: the smallest value with at least `p`% of the values at or below it. */
export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[rank - 1] as number;
}

export interface Spread {
  n: number;
  mean: number | null;
  median: number | null;
  p95: number | null;
}

export function spread(values: readonly number[]): Spread {
  return {
    n: values.length,
    mean: mean(values),
    median: median(values),
    p95: percentile(values, 95),
  };
}

/**
 * The verdict held by more votes than any other; `tie` when two verdicts share the top count;
 * null without votes.
 */
export function plurality<T extends string>(votes: readonly T[], tie: T): T | null {
  if (votes.length === 0) return null;
  const counts = new Map<T, number>();
  for (const v of votes) counts.set(v, (counts.get(v) ?? 0) + 1);
  const ranked = [...counts].sort((a, b) => b[1] - a[1]);
  const [first, second] = ranked;
  if (!first) return null;
  if (second && second[1] === first[1]) return tie;
  return first[0];
}

/** Correct when more judges say correct than wrong: a tie is wrong. Null without votes. */
export function majorityCorrect(votes: readonly boolean[]): boolean | null {
  if (votes.length === 0) return null;
  const yes = votes.filter((v) => v).length;
  return yes > votes.length - yes;
}

/**
 * Agreement between judges over items, each item a list of verdicts (undefined: that judge gave
 * none). `share` is the share of agreeing judge pairs over all pairs that both judged an item;
 * `unanimous` counts the items with at least two verdicts, all equal.
 */
export function judgeAgreement(items: readonly (readonly (string | undefined)[])[]): {
  items: number;
  unanimous: number;
  pairs: number;
  agreeing: number;
  share: number | null;
} {
  let pairs = 0;
  let agreeing = 0;
  let counted = 0;
  let unanimous = 0;
  for (const item of items) {
    const given = item.filter((v): v is string => v !== undefined);
    if (given.length < 2) continue;
    counted++;
    if (given.every((v) => v === given[0])) unanimous++;
    for (let i = 0; i < given.length; i++) {
      for (let j = i + 1; j < given.length; j++) {
        pairs++;
        if (given[i] === given[j]) agreeing++;
      }
    }
  }
  return { items: counted, unanimous, pairs, agreeing, share: pairs ? agreeing / pairs : null };
}

/** A promise pool: runs `fn` over `items`, at most `limit` at once, and keeps the order. */
export async function pool<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i] as T, i);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return out;
}
