import { MODELS_BY_NAME, type ModelId, type RunVerdict } from "@chebot/protocol";
import { type ReactNode, useId } from "react";
import { t } from "../i18n/index.ts";
import {
  CLAUDE_RAYS,
  GLYPH,
  LOGO,
  type Mark,
  outcomeOf,
  ratingLabel,
  rowsOf,
} from "../view/verdict-art.ts";

// The verdict over the picture of a question, as the cards of grokeado show theirs: at the top, a
// label with the mark of the outcome (Verdadero, Sí, Dato...); at the bottom, what the question
// asks and how each model rated it, its rating's mark beside the real logos of the models that
// gave it. A fact has the label alone, with the mark of a chart. The shapes of ModelMark stay the
// marks of the rest of the page; these logos are the card's.

/** A drawing beside the words that say it: screen readers skip it. */
function Svg(props: {
  viewBox: string;
  size?: number;
  className?: string;
  fill?: string;
  children: ReactNode;
}) {
  return (
    <svg
      className={props.className}
      viewBox={props.viewBox}
      width={props.size}
      height={props.size}
      fill={props.fill}
      aria-hidden="true"
      focusable="false"
    >
      {props.children}
    </svg>
  );
}

/** The logo of each model's maker, for the votes of a card (grokeado's marks). */
export function ModelLogo({ model, size = 16 }: { model: ModelId; size?: number }) {
  const gradient = useId();
  const props = { className: "model-logo", size };
  switch (model) {
    case "grok":
      return (
        <Svg
          {...props}
          viewBox={`0 0 ${LOGO.grok.viewBox} ${LOGO.grok.viewBox}`}
          fill="currentColor"
        >
          {LOGO.grok.paths.map((d) => (
            <path key={d} d={d} />
          ))}
        </Svg>
      );
    case "gemini":
      return (
        <Svg {...props} viewBox="0 0 24 24">
          <defs>
            <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor={LOGO.gemini.gradient[0]} />
              <stop offset="1" stopColor={LOGO.gemini.gradient[1]} />
            </linearGradient>
          </defs>
          <path d={LOGO.gemini.path} fill={`url(#${gradient})`} />
        </Svg>
      );
    case "openai":
      return (
        <Svg {...props} viewBox="0 0 24 24" fill="currentColor">
          <path d={LOGO.openai.path} />
        </Svg>
      );
    case "claude":
      return (
        <Svg {...props} viewBox="0 0 24 24">
          <g stroke={LOGO.claude.color} strokeWidth={LOGO.claude.strokeWidth} strokeLinecap="round">
            {CLAUDE_RAYS.map((ray) => (
              <line key={`${ray.x2}`} x1={12} y1={12} x2={ray.x2} y2={ray.y2} />
            ))}
          </g>
        </Svg>
      );
  }
}

/** The mark of a rating, as grokeado's (a thumb up or down, a question mark, an exclamation). */
function Glyph({ mark }: { mark: Mark }) {
  const props = { viewBox: "0 0 16 16" };
  switch (mark) {
    case "fact":
      return (
        <Svg {...props} fill="currentColor">
          {GLYPH.bars.map((bar) => (
            <rect key={bar.x} {...bar} />
          ))}
        </Svg>
      );
    case "unknown":
      return (
        <Svg {...props}>
          <path
            d={GLYPH.question.path}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <circle {...GLYPH.question.dot} fill="currentColor" />
        </Svg>
      );
    case "depends":
      return (
        <Svg {...props}>
          <path
            d={GLYPH.exclamation.path}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle {...GLYPH.exclamation.dot} fill="currentColor" />
        </Svg>
      );
    case "split":
      return (
        <Svg {...props} fill="currentColor">
          <path
            d={GLYPH.scales.beam}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <path d={GLYPH.scales.pans} />
        </Svg>
      );
    default:
      return (
        <Svg {...props} className={mark === "false" ? "glyph-down" : undefined}>
          <path d={GLYPH.thumb} fill="currentColor" />
        </Svg>
      );
  }
}

/** A mark in its circle, in the color of what it stands for; a dash for a model that gave none. */
function Dot({ mark }: { mark: Mark | null }) {
  return (
    <span className="card-verdict-dot" data-mark={mark ?? "none"}>
      {mark ? <Glyph mark={mark} /> : "–"}
    </span>
  );
}

/** What a screen reader reads for the verdict of a card: "Afirmación: Engañoso. Grok: Verdadero; ...". */
export function verdictText(verdict: RunVerdict): string {
  const outcome = outcomeOf(verdict, t.verdict);
  if (verdict.kind === "fact") return t.verdict.said(t.verdict.kinds.fact, []);
  const kind = verdict.kind;
  const heading = outcome ? `${t.verdict.kinds[kind]}: ${outcome.label}` : t.verdict.kinds[kind];
  const votes = MODELS_BY_NAME.filter((m) => m in verdict.votes).map((m) => {
    const rating = verdict.votes[m] ?? null;
    return `${t.models[m]}: ${rating ? ratingLabel(t.verdict, kind, rating) : t.verdict.none}`;
  });
  return t.verdict.said(heading, votes);
}

/**
 * The verdict over a picture (`.card-picture` or the picture of a run's page), for the eye: the
 * card says it in words with `verdictText`.
 */
export function VerdictOverlay({ verdict }: { verdict: RunVerdict }) {
  const outcome = outcomeOf(verdict, t.verdict);
  const kind = verdict.kind;
  return (
    <span className="card-verdict" aria-hidden="true" data-testid="verdict">
      {outcome && (
        <span className="card-verdict-label" data-mark={outcome.mark}>
          <Dot mark={outcome.mark} />
          {outcome.label}
        </span>
      )}
      {kind !== "fact" && Object.keys(verdict.votes).length > 0 && (
        <span className="card-verdict-votes">
          <span className="card-verdict-kind">{t.verdict.kinds[kind]}</span>
          {rowsOf(verdict).map((row) => (
            <span key={row.rating ?? "none"} className="card-verdict-row">
              <Dot mark={row.rating} />
              {row.models.map((m) => (
                <span key={m} className="card-verdict-model" data-logo={m}>
                  <ModelLogo model={m} />
                </span>
              ))}
            </span>
          ))}
        </span>
      )}
    </span>
  );
}
