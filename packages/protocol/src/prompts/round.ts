import type { Snapshot, Source } from "../model.ts";
import {
  LANGUAGE_RULE,
  type Prompt,
  renderDocument,
  renderSources,
  STRUCTURED_RULE,
} from "./common.ts";

/** A thread as one reviewer sees it: the other reviewers are "Reviewer A/B/C", shuffled per thread. */
export interface ThreadView {
  id: string;
  block: string;
  alternatives: {
    id: string;
    by: string; // "you" or "Reviewer B"
    op: string;
    text: string;
    reason: string;
  }[];
  positions: { by: string; choice: string; reason: string }[];
  yours: string | null;
}

export function roundPrompt(input: {
  question: string;
  round: 1 | 2 | 3;
  cap: number;
  snapshot: Snapshot;
  sources: readonly Source[];
  threads: readonly ThreadView[];
  locked: readonly string[];
}): Prompt {
  const { round } = input;
  const proposes = round < 3;
  const votes = round > 1;
  const rules = [
    `You are one of four reviewers improving a shared answer to a user's question, in round ${round} of 3. You never edit the text: you ${proposes && votes ? "vote on open threads and suggest changes" : proposes ? "suggest changes" : "vote on open threads"}. Code applies the decisions once at the end of the round.`,
  ];
  if (proposes) {
    rules.push(
      "Suggestions:",
      `- At most ${input.cap} suggestions, most important first: any beyond ${input.cap} are discarded unread.`,
      "- Substance only: content that is wrong, missing or misleading (kind wrong, missing or misleading). Wording, tone, style and order are not your job; a suggestion of kind style is discarded.",
      "- Each targets a paragraph by its id: replace (the full new text of the paragraph), insert_after (the full text of a new paragraph after it) or delete (empty text).",
      "- reason: one sentence saying what is wrong and why. A longer reason discards the suggestion.",
      "- sources: ids from the list of sources below, or none. Web search is off in this round; an unknown id is removed.",
      "- Suggest nothing when the text is right. A suggestion the others already rejected cannot be made again.",
    );
    if (input.locked.length > 0) {
      rules.push(
        `- Paragraphs ${input.locked.join(", ")} have an open thread: they are locked. A suggestion on them joins their thread as one more alternative instead of opening a new one; vote there if an existing alternative says what you mean.`,
      );
    }
  }
  if (votes) {
    rules.push(
      "Votes:",
      '- For each open thread, hold one position: one of its suggestion ids, or "keep" (leave the paragraph as it is). You may vote on every thread.',
      "- The other reviewers are shown as Reviewer A, B and C, in an order shuffled per thread. Judge the arguments and the sources, not how many hold a position.",
      "- If you change your position, give a one-sentence reason with the new argument that convinced you; a change without a reason is ignored and your previous position stands.",
      "- A suggestion is accepted when at least 2 reviewers other than its author hold it and they are a majority of the others who took a position.",
    );
  }
  rules.push(LANGUAGE_RULE, STRUCTURED_RULE);

  const threads =
    input.threads.length === 0
      ? ""
      : `\n\nOpen threads:\n\n${input.threads
          .map((t) =>
            [
              `### ${t.id} on ${t.block}`,
              ...t.alternatives.map(
                (a) =>
                  `- ${a.id} by ${a.by}: ${a.op}${a.op === "delete" ? "" : ` with:\n  "${a.text}"`}\n  reason: ${a.reason}`,
              ),
              "Positions:",
              ...t.positions.map(
                (p) => `- ${p.by}: ${p.choice}${p.reason ? ` (${p.reason})` : ""}`,
              ),
              `Your position: ${t.yours ?? "none yet"}`,
            ].join("\n"),
          )
          .join("\n\n")}`;

  return {
    system: rules.join("\n"),
    prompt: `Question:\n${input.question}\n\nThe current answer:\n\n${renderDocument(input.snapshot)}\n\nSources:\n${renderSources(input.sources)}${threads}`,
  };
}
