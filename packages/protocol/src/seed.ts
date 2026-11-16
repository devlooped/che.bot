import type { Claim, Draft, Flags, ModelId, Paragraph, Snapshot } from "./model.ts";
import type { OutputOf } from "./schemas.ts";
import { statusFromSupport } from "./threads.ts";
import { byModelOrder, byNumericId, normalizeText, uniqueSorted } from "./util.ts";

export interface Conflict {
  first: string;
  second: string;
}

/**
 * Builds the seeded document (version 1) from the drafts and the merge output. The merge model
 * only groups claims into paragraphs and names conflicting pairs; the status of each paragraph is
 * derived here: 4 supporting models is `agreed`, 3 is `majority`, fewer or a conflict is
 * `contested`.
 *
 * The claim coverage check: every claim of every draft must be carried by a paragraph. There is
 * no retry. Unknown claim ids and empty paragraphs are ignored; then:
 * - claims the merge dropped are appended, in draft order, as paragraphs of their own
 *   (`dropped_claims`), so nothing a model said is lost and each such paragraph is contested;
 * - with no usable merge (abstained, invalid, no paragraph left, or skipped by the budget) the whole
 *   document is built that way (`no_merge`).
 * In both fallbacks, claims whose normalized text is identical share one paragraph and its support.
 */
export function seedDocument(input: {
  drafts: readonly Draft[];
  claims: Readonly<Record<string, Claim>>;
  merge: OutputOf<"merge"> | null;
}): {
  snapshot: Snapshot;
  conflicts: Conflict[];
  fallback: Flags["mergeFallback"];
  nextParagraph: number;
} {
  const allClaims = input.drafts.flatMap((d) => d.claims);
  const known = new Set(allClaims);
  const groups: { text: string; claims: string[] }[] = [];
  for (const p of input.merge?.paragraphs ?? []) {
    const text = p.text.trim();
    if (text === "") continue;
    groups.push({
      text,
      claims: [...new Set(p.claims.map((c) => c.trim()))].filter((c) => known.has(c)),
    });
  }
  let fallback: Flags["mergeFallback"] = groups.length === 0 ? "no_merge" : null;

  const covered = new Set(groups.flatMap((g) => g.claims));
  const dropped = allClaims.filter((id) => !covered.has(id));
  if (dropped.length > 0 && fallback === null) fallback = "dropped_claims";
  const byText = new Map<string, { text: string; claims: string[] }>();
  for (const id of dropped) {
    const claim = input.claims[id];
    if (!claim) continue;
    const key = normalizeText(claim.text);
    const group = byText.get(key);
    if (group) group.claims.push(id);
    else {
      const g = { text: claim.text.trim(), claims: [id] };
      byText.set(key, g);
      groups.push(g);
    }
  }

  const conflicts: Conflict[] = [];
  const seen = new Set<string>();
  for (const c of input.merge?.conflicts ?? []) {
    const first = c.first.trim();
    const second = c.second.trim();
    if (!known.has(first) || !known.has(second) || first === second) continue;
    const key = [first, second].sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    conflicts.push({ first, second });
  }
  const conflicted = new Set(conflicts.flatMap((c) => [c.first, c.second]));

  const order: string[] = [];
  const blocks: Record<string, Paragraph> = {};
  groups.forEach((g, i) => {
    const id = `p${i + 1}`;
    const claims = g.claims.map((c) => input.claims[c]).filter((c): c is Claim => c !== undefined);
    const support = uniqueSorted<ModelId>(
      claims.map((c) => c.model),
      byModelOrder,
    );
    order.push(id);
    blocks[id] = {
      kind: "paragraph",
      id,
      text: g.text,
      support,
      status: statusFromSupport(
        support,
        g.claims.some((c) => conflicted.has(c)),
      ),
      sources: uniqueSorted(
        claims.flatMap((c) => c.sources),
        byNumericId,
      ),
      claims: g.claims,
    };
  });
  return {
    snapshot: { version: 1, order, blocks },
    conflicts,
    fallback,
    nextParagraph: groups.length + 1,
  };
}
