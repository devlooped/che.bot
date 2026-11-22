import { MODELS_BY_NAME, type ModelId } from "@chebot/protocol";
import { useId, useSyncExternalStore } from "react";
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

/** A model's name in a sentence, after its mark: "■ Grok". */
export function ModelName({ model }: { model: ModelId }) {
  return (
    <span className="model-name">
      <ModelMark model={model} />
      {t.models[model]}
    </span>
  );
}

const byName = new Map(Object.entries(t.models).map(([m, name]) => [name, m as ModelId]));
const names = new RegExp(`\\b(${[...byName.keys()].join("|")})\\b`);

/**
 * A sentence of the interface with each model's name after its mark. Only for the interface's own
 * texts: a model's words (an answer, a reason, a quote) stay as they were written.
 */
export function WithMarks({ text }: { text: string }) {
  // split with a capturing group: the names are at the odd places
  const parts = text.split(names);
  if (parts.length === 1) return text;
  return parts.map((part, i) => {
    const model = i % 2 === 1 ? byName.get(part) : undefined;
    // biome-ignore lint/suspicious/noArrayIndexKey: the parts of a text are in their order
    return model ? <ModelName key={i} model={model} /> : part;
  });
}

/**
 * The marks of who holds a paragraph, in the margin, as large as those of the seats: how many
 * there are says how many of four hold it.
 */
export function Support({ support }: { support: readonly ModelId[] }) {
  return (
    <span className="support" aria-hidden="true">
      {MODELS_BY_NAME.filter((m) => support.includes(m)).map((m) => (
        <ModelMark key={m} model={m} size={12} />
      ))}
    </span>
  );
}

// The one mark of the page that shows its name: the last one hovered, focused or tapped, so that a
// new one hides the label of the one before.
let shown: string | null = null;
const listeners = new Set<() => void>();
function show(id: string | null) {
  shown = id;
  for (const l of listeners) l();
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/**
 * A mark in a line of text, as large as an emoji: hovering, focusing or tapping it shows the name
 * of its model, so the shapes read on a phone too.
 */
export function NamedMark({ model }: { model: ModelId }) {
  const id = useId();
  const open = useSyncExternalStore(
    subscribe,
    () => shown === id,
    () => false,
  );
  const hide = () => {
    if (shown === id) show(null);
  };
  return (
    <button
      type="button"
      className={`named-mark${open ? " named-mark-open" : ""}`}
      aria-label={t.models[model]}
      data-name={t.models[model]}
      // A touch also enters and leaves: only a mouse shows the name by hovering.
      onPointerEnter={(e) => e.pointerType === "mouse" && show(id)}
      onPointerLeave={(e) => e.pointerType === "mouse" && hide()}
      onFocus={() => show(id)}
      onClick={() => show(id)}
      onBlur={hide}
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
