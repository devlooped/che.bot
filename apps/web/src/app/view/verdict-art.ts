import { MODELS_BY_NAME, type ModelId, type Rating, type RunVerdict } from "@chebot/protocol";
import type { VerdictMessages } from "../i18n/verdict.ts";

// What the verdict over a picture says and draws, as data: the card of the page (Verdict.tsx)
// draws it in React and the picture that a shared link previews (worker/card.ts) in a raster, so
// the two show the same marks.

/** The logos of each model's maker (the paths of grokeado's marks, in their own viewBox). */
export const LOGO = {
  grok: {
    viewBox: 1024,
    paths: [
      "M395.479 633.828L735.91 381.105C752.599 368.715 776.454 373.548 784.406 392.792C826.26 494.285 807.561 616.253 724.288 699.996C641.016 783.739 525.151 802.104 419.247 760.277L303.556 814.143C469.49 928.202 670.987 899.995 796.901 773.282C896.776 672.843 927.708 535.937 898.785 412.476L899.047 412.739C857.105 231.37 909.358 158.874 1016.4 10.6326C1018.93 7.11771 1021.47 3.60279 1024 0L883.144 141.651V141.212L395.392 633.916",
      "M325.226 695.251C206.128 580.84 226.662 403.776 328.285 301.668C403.431 226.097 526.549 195.254 634.026 240.596L749.454 186.994C728.657 171.88 702.007 155.623 671.424 144.2C533.19 86.9942 367.693 115.465 255.323 228.382C147.234 337.081 113.244 504.215 171.613 646.833C215.216 753.423 143.739 828.818 71.7385 904.916C46.2237 931.893 20.6216 958.87 0 987.429L325.139 695.339",
    ],
  },
  gemini: {
    viewBox: 24,
    path: "M12 2c.6 5.4 4.6 9.4 10 10-5.4.6-9.4 4.6-10 10-.6-5.4-4.6-9.4-10-10 5.4-.6 9.4-4.6 10-10Z",
    gradient: ["#4796e3", "#9b72cb"],
  },
  openai: {
    viewBox: 24,
    path: "M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z",
  },
  claude: { viewBox: 24, color: "#d97757", strokeWidth: 2.4 },
} as const;

/** The rays of the mark of Claude: from the center (12, 12) of its viewBox, long and short in turn. */
export const CLAUDE_RAYS = Array.from({ length: 10 }, (_, i) => {
  const angle = (i * Math.PI) / 5;
  const r = i % 2 ? 7 : 10;
  return { x2: 12 + r * Math.cos(angle), y2: 12 + r * Math.sin(angle) };
});

/** The marks inside the circle of a rating, in a 16 x 16 box. */
export const GLYPH = {
  /** The bars of a chart: a fact. */
  bars: [
    { x: 2.5, y: 8, width: 2.6, height: 5.5, rx: 0.5 },
    { x: 6.7, y: 3, width: 2.6, height: 10.5, rx: 0.5 },
    { x: 10.9, y: 5.8, width: 2.6, height: 7.7, rx: 0.5 },
  ],
  /** The question mark: its curve is stroked (1.8 wide), its dot is a circle. */
  question: {
    path: "M5.5 5.5a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1.9-1.1 1.8",
    dot: { cx: 8, cy: 12.5, r: 1.1 },
  },
  /** The exclamation mark: its stroke is 2 wide. */
  exclamation: { path: "M8 3v6", dot: { cx: 8, cy: 12.5, r: 1.1 } },
  /** The scales: the stroked beam and the filled pans. */
  scales: {
    beam: "M8 2.5v10M5 13.5h6M3 4.5h10",
    pans: "M3 5.2 1.3 9h3.4zM13 5.2 11.3 9h3.4z",
  },
  /** The thumb up; the thumb of a "false" is this one turned half a turn. */
  thumb:
    "M2 7h2.5v7H2zM6 14h5.6c.8 0 1.4-.5 1.6-1.2l1.1-4.2c.3-1-.5-1.9-1.5-1.9H9.6l.5-2.6c.2-1-.5-2.1-1.6-2.1L6 6.6Z",
} as const;

/** What a mark stands for: a rating, a fact, or a vote split between ratings. */
export type Mark = Rating | "fact" | "split";

/** The word of a rating for what the question asks. */
export function ratingLabel(
  texts: VerdictMessages,
  kind: "claim" | "question",
  rating: Rating,
): string {
  return texts.ratings[kind][rating];
}

/** The label at the top: the outcome, or "Dato". Null when the models gave no rating. */
export function outcomeOf(
  verdict: RunVerdict,
  texts: VerdictMessages,
): { mark: Mark; label: string } | null {
  if (verdict.kind === "fact") return { mark: "fact", label: texts.kinds.fact };
  if (verdict.outcome === null) return null;
  if (verdict.outcome === "split") return { mark: "split", label: texts.split };
  return { mark: verdict.outcome, label: ratingLabel(texts, verdict.kind, verdict.outcome) };
}

/** The votes in rows of one rating each, the outcome's first; the models of a row by name. */
export function rowsOf(verdict: RunVerdict): { rating: Rating | null; models: ModelId[] }[] {
  const order: (Rating | null)[] = ["true", "false", "depends", "unknown", null];
  if (verdict.outcome && verdict.outcome !== "split")
    order.sort((a, b) => Number(b === verdict.outcome) - Number(a === verdict.outcome));
  return order.flatMap((rating) => {
    const models = MODELS_BY_NAME.filter(
      (m) => m in verdict.votes && (verdict.votes[m] ?? null) === rating,
    );
    return models.length ? [{ rating, models }] : [];
  });
}
