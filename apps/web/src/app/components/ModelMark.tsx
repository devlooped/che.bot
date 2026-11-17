import { MODELS_BY_NAME, type ModelId } from "@chebot/protocol";
import { useState } from "react";
import { t } from "../i18n/index.ts";

// Each model has a color and a shape, used together everywhere (the shape keeps them apart without
// color): Grok a square, Claude a star, ChatGPT a circle, Gemini a diamond. The stylesheet
// paints a mark in the model's fill, outlined in its ink: a mark is always filled.

const SHAPES: Record<ModelId, string> = {
  grok: "M2.5 2.5h7v7h-7z",
  claude:
    "M6 1L7.29 4.62L11.14 4.73L8.09 7.08L9.17 10.77L6 8.6L2.83 10.77L3.91 7.08L0.86 4.73L4.71 4.62z",
  openai: "M6 1.5a4.5 4.5 0 1 1 0 9a4.5 4.5 0 1 1 0-9z",
  gemini: "M6 .8l5.2 5.2l-5.2 5.2l-5.2-5.2z",
};

export function ModelMark({
  model,
  size = 12,
  className,
}: {
  model: ModelId;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={`model-mark ink-${model}${className ? ` ${className}` : ""}`}
      width={size}
      height={size}
      viewBox="0 0 12 12"
      aria-hidden="true"
      focusable="false"
    >
      <path d={SHAPES[model]} strokeLinejoin="round" />
    </svg>
  );
}

/** The marks of who holds a paragraph, in the margin; the badge beside them says how many of four. */
export function Support({ support }: { support: readonly ModelId[] }) {
  return (
    <span className="support" aria-hidden="true">
      {MODELS_BY_NAME.filter((m) => support.includes(m)).map((m) => (
        <ModelMark key={m} model={m} size={9} />
      ))}
    </span>
  );
}

/**
 * A mark in a line of text, as large as an emoji: hovering, focusing or tapping it shows the name
 * of its model, so the shapes read on a phone too.
 */
export function NamedMark({ model }: { model: ModelId }) {
  const [open, setOpen] = useState(false);
  return (
    <button
      type="button"
      className={`named-mark${open ? " named-mark-open" : ""}`}
      aria-label={t.models[model]}
      data-name={t.models[model]}
      onClick={() => setOpen((o) => !o)}
      onBlur={() => setOpen(false)}
    >
      <ModelMark model={model} />
    </button>
  );
}

/** A group of a tally: a lead (a word or an emoji) and the marks of its models. */
export interface TallyPart {
  /** What tells the group apart: data-part, for the stylesheet and the tests. */
  kind: string;
  /** What the eye reads before the marks: "Por", "👍". */
  lead: string;
  /** What a screen reader reads in place of the lead, when the lead is an emoji. */
  label?: string;
  models: readonly ModelId[];
}

/** Who did what, as marks: "Por ■★ 👍●◆", "👍 ★ 👎 ■ ❔ ◆". An empty group is left out. */
export function Tally({ parts }: { parts: readonly TallyPart[] }) {
  return (
    <span className="tally">
      {parts
        .filter((p) => p.models.length > 0)
        .map((p) => (
          <span key={p.kind} className="tally-part" data-part={p.kind}>
            {p.label ? (
              <>
                <span aria-hidden="true">{p.lead}</span>
                <span className="sr-only">{p.label}</span>
              </>
            ) : (
              p.lead
            )}
            {MODELS_BY_NAME.filter((m) => p.models.includes(m)).map((m) => (
              <NamedMark key={m} model={m} />
            ))}
          </span>
        ))}
    </span>
  );
}

/** The votes on a proposal: who held it, who preferred to keep the text, who did not vote. */
export function Votes({
  holders,
  keep,
  silent,
}: {
  holders: readonly ModelId[];
  keep: readonly ModelId[];
  silent: readonly ModelId[];
}) {
  const v = t.tally.votes;
  return (
    <Tally
      parts={[
        { kind: "for", lead: "👍", label: v.for, models: holders },
        { kind: "against", lead: "👎", label: v.against, models: keep },
        { kind: "silent", lead: "❔", label: v.silent, models: silent },
      ]}
    />
  );
}
