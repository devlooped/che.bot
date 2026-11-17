import { MODELS, type ModelId } from "@chebot/protocol";

// Each model has a color and a shape, used together everywhere (the shape keeps them apart without
// color): Grok a square, Claude a circle, ChatGPT a triangle, Gemini a diamond. The stylesheet
// paints a filled mark in the model's fill, outlined in its ink, and a hollow one in its ink.

const SHAPES: Record<ModelId, string> = {
  grok: "M2.5 2.5h7v7h-7z",
  claude: "M6 1.5a4.5 4.5 0 1 1 0 9a4.5 4.5 0 1 1 0-9z",
  openai: "M6 1.5l5 9h-10z",
  gemini: "M6 .8l5.2 5.2l-5.2 5.2l-5.2-5.2z",
};

export function ModelMark({
  model,
  filled = true,
  size = 12,
  className,
}: {
  model: ModelId;
  filled?: boolean;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={`model-mark ink-${model}${filled ? "" : " model-mark-hollow"}${className ? ` ${className}` : ""}`}
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

/** The four shapes of a paragraph's support: filled for who holds it, hollow for who does not. */
export function Support({ support }: { support: readonly ModelId[] }) {
  return (
    <span className="support" aria-hidden="true">
      {MODELS.map((m) => (
        <ModelMark key={m} model={m} filled={support.includes(m)} size={9} />
      ))}
    </span>
  );
}
