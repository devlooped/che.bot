import { MODELS_BY_NAME, type ModelId, type RunVerdict } from "@chebot/protocol";
import { initWasm, Resvg } from "@resvg/resvg-wasm";
import resvgWasm from "@resvg/resvg-wasm/index_bg.wasm?module";
import { verdictEsAR } from "../app/i18n/verdict.ts";
import { CLAUDE_RAYS, GLYPH, LOGO, type Mark, outcomeOf, rowsOf } from "../app/view/verdict-art.ts";
import semiBold from "./fonts/instrument-sans-600.ttf?inline";
import bold from "./fonts/instrument-sans-700.ttf?inline";

// The picture that a shared link previews: the picture of the question with its verdict over it,
// as the page shows it (the label of the outcome at the top left, the votes at the bottom right),
// on the light theme. The crawlers of WhatsApp, X or Slack run no stylesheet, so the marks are
// drawn into the picture: an SVG (this file) with the picture and the marks over it, rasterized by
// resvg.

/** The side of the card in the units of its SVG, and in pixels once rasterized: a PNG of a picture is
 *  heavy, and the apps that show a preview skip the large ones. */
export const CARD_SIZE = 1000;
const CARD_PIXELS = 800;

// The sizes of the stylesheet (.card-verdict), in rem, drawn here at 46.4 pixels each: a rem of
// the 26 rem card of a run's page, scaled up so that the marks read on a thumbnail.
const REM = 46.4;
const MARGIN = 0.65 * REM;
const DOT = 2 * REM;
const GAP = 0.3 * REM;
const LABEL_PAD = { top: 0.25 * REM, right: 0.8 * REM, left: 0.25 * REM, gap: 0.4 * REM };
const LABEL_FONT = 1.1 * REM;
const PANEL_PAD = 0.5 * REM;
const KIND_FONT = 0.7 * REM;

// The tokens of the light theme (styles.css, :root): the picture is the one place of the preview
// that shows the page's marks, and they read best on paper.
const COLOR = {
  paper: "#eef2f3",
  raised: "#f9fbfb",
  ink: "#17202b",
  muted: "#56616c",
  rule: "#cbd3d8",
  none: "#8b98a2",
  glyph: "#fff",
  glyphDark: "#1b1915",
  mark: {
    true: "#2f7a4b",
    false: "#b3361f",
    depends: "#e98939",
    unknown: "#e4c037",
    fact: "#3c5ea8",
    split: "#5b6670",
  } satisfies Record<Mark, string>,
};

const FAMILY = "Instrument Sans";

const escapeXml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The bytes of a `?inline` import: a data URL. */
function bytesOf(dataUrl: string): Uint8Array {
  const binary = atob(dataUrl.slice(dataUrl.indexOf(",") + 1));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

const fonts = [bytesOf(semiBold), bytesOf(bold)];
let ready: Promise<void> | null = null;
const loadWasm = () => {
  ready ??= initWasm(resvgWasm).catch((error: unknown) => {
    ready = null;
    throw error;
  });
  return ready;
};

const options = (width: number) => ({
  fitTo: { mode: "width" as const, value: width },
  font: { fontBuffers: fonts, defaultFontFamily: FAMILY, loadSystemFonts: false },
});

/** The width of a text in the font, as the renderer lays it out. */
function textWidth(text: string, size: number, weight: number, spacing = 0): number {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="200"><text x="0" y="100" font-family="${FAMILY}" font-weight="${weight}" font-size="${size}" letter-spacing="${spacing}">${escapeXml(text)}</text></svg>`;
  return new Resvg(svg, options(2000)).getBBox()?.width ?? text.length * size * 0.6;
}

/** What a mark draws inside its circle, in a 16 x 16 box. */
function glyph(mark: Mark): string {
  // dark on the light marks (the yellow and the orange), white on the others
  const ink = mark === "depends" || mark === "unknown" ? COLOR.glyphDark : COLOR.glyph;
  const stroke = (width: number) =>
    `fill="none" stroke="${ink}" stroke-width="${width}" stroke-linecap="round"`;
  switch (mark) {
    case "fact":
      return GLYPH.bars
        .map(
          (b) =>
            `<rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" rx="${b.rx}" fill="${ink}"/>`,
        )
        .join("");
    case "unknown":
      return `<path d="${GLYPH.question.path}" ${stroke(1.8)}/><circle cx="${GLYPH.question.dot.cx}" cy="${GLYPH.question.dot.cy}" r="${GLYPH.question.dot.r}" fill="${ink}"/>`;
    case "depends":
      return `<path d="${GLYPH.exclamation.path}" ${stroke(2)}/><circle cx="${GLYPH.exclamation.dot.cx}" cy="${GLYPH.exclamation.dot.cy}" r="${GLYPH.exclamation.dot.r}" fill="${ink}"/>`;
    case "split":
      return `<path d="${GLYPH.scales.beam}" ${stroke(1.6)}/><path d="${GLYPH.scales.pans}" fill="${ink}"/>`;
    case "false":
      return `<path d="${GLYPH.thumb}" fill="${ink}" transform="rotate(180 8 8)"/>`;
    default:
      return `<path d="${GLYPH.thumb}" fill="${ink}"/>`;
  }
}

/** A mark in its circle at (x, y), `DOT` wide; a dash for a model that gave no rating. */
function dot(x: number, y: number, mark: Mark | null): string {
  const circle = `<circle cx="${x + DOT / 2}" cy="${y + DOT / 2}" r="${DOT / 2}" fill="${mark ? COLOR.mark[mark] : COLOR.none}"/>`;
  if (!mark)
    return `${circle}<text x="${x + DOT / 2}" y="${y + DOT / 2 + 0.34 * DOT * 0.55}" text-anchor="middle" font-family="${FAMILY}" font-weight="700" font-size="${DOT * 0.55}" fill="${COLOR.glyph}">–</text>`;
  const size = DOT * 0.62;
  const at = (DOT - size) / 2;
  return `${circle}<g transform="translate(${x + at} ${y + at}) scale(${size / 16})">${glyph(mark)}</g>`;
}

/** The logo of a model's maker, in the circle at (x, y). */
function logo(x: number, y: number, model: ModelId): string {
  const circle = `<circle cx="${x + DOT / 2}" cy="${y + DOT / 2}" r="${DOT / 2}" fill="${COLOR.paper}"/>`;
  const size = DOT * 0.62;
  const move = `translate(${x + (DOT - size) / 2} ${y + (DOT - size) / 2})`;
  switch (model) {
    case "grok": {
      const paths = LOGO.grok.paths.map((d) => `<path d="${d}"/>`).join("");
      return `${circle}<g transform="${move} scale(${size / LOGO.grok.viewBox})" fill="${COLOR.ink}">${paths}</g>`;
    }
    case "openai":
      return `${circle}<g transform="${move} scale(${size / LOGO.openai.viewBox})" fill="${COLOR.ink}"><path d="${LOGO.openai.path}"/></g>`;
    case "gemini":
      return `${circle}<g transform="${move} scale(${size / LOGO.gemini.viewBox})"><path d="${LOGO.gemini.path}" fill="url(#gemini)"/></g>`;
    case "claude": {
      const rays = CLAUDE_RAYS.map((r) => `<line x1="12" y1="12" x2="${r.x2}" y2="${r.y2}"/>`).join(
        "",
      );
      return `${circle}<g transform="${move} scale(${size / LOGO.claude.viewBox})" stroke="${LOGO.claude.color}" stroke-width="${LOGO.claude.strokeWidth}" stroke-linecap="round">${rays}</g>`;
    }
  }
}

/** The label of the outcome, a pill at the top left with its mark at its round end. */
function label(verdict: RunVerdict): string {
  const outcome = outcomeOf(verdict, verdictEsAR);
  if (!outcome) return "";
  const height = DOT + 2 * LABEL_PAD.top;
  const text = textWidth(outcome.label, LABEL_FONT, 600);
  const width = LABEL_PAD.left + DOT + LABEL_PAD.gap + text + LABEL_PAD.right;
  const textX = MARGIN + LABEL_PAD.left + DOT + LABEL_PAD.gap;
  return (
    `<rect x="${MARGIN}" y="${MARGIN}" width="${width}" height="${height}" rx="${height / 2}" fill="${COLOR.raised}" stroke="${COLOR.rule}" stroke-width="3"/>` +
    dot(MARGIN + LABEL_PAD.left, MARGIN + LABEL_PAD.top, outcome.mark) +
    `<text x="${textX}" y="${MARGIN + height / 2 + 0.35 * LABEL_FONT}" font-family="${FAMILY}" font-weight="600" font-size="${LABEL_FONT}" fill="${COLOR.ink}">${escapeXml(outcome.label)}</text>`
  );
}

/** The votes at the bottom right: what the question asks, then a row of logos for each rating. */
function votes(verdict: RunVerdict): string {
  if (verdict.kind === "fact" || Object.keys(verdict.votes).length === 0) return "";
  const heading = verdictEsAR.kinds[verdict.kind].toLocaleUpperCase("es");
  const spacing = 0.08 * KIND_FONT;
  const headingWidth = textWidth(heading, KIND_FONT, 700, spacing);
  const headingHeight = 1.2 * KIND_FONT;
  const rows = rowsOf(verdict).map((row) => ({
    ...row,
    width: DOT + row.models.length * (DOT + GAP),
  }));
  const inner = Math.max(headingWidth, ...rows.map((r) => r.width));
  const width = inner + 2 * PANEL_PAD;
  const height = 2 * PANEL_PAD + headingHeight + rows.length * (GAP + DOT);
  const left = CARD_SIZE - MARGIN - width;
  const top = CARD_SIZE - MARGIN - height;
  const right = left + width - PANEL_PAD;
  let out = `<rect x="${left}" y="${top}" width="${width}" height="${height}" rx="${0.8 * REM}" fill="${COLOR.raised}" stroke="${COLOR.rule}" stroke-width="3"/>`;
  out += `<text x="${right}" y="${top + PANEL_PAD + 0.85 * KIND_FONT}" text-anchor="end" font-family="${FAMILY}" font-weight="700" font-size="${KIND_FONT}" letter-spacing="${spacing}" fill="${COLOR.muted}">${escapeXml(heading)}</text>`;
  let y = top + PANEL_PAD + headingHeight;
  for (const row of rows) {
    y += GAP;
    let x = right - row.width;
    out += dot(x, y, row.rating);
    for (const model of MODELS_BY_NAME.filter((m) => row.models.includes(m))) {
      x += DOT + GAP;
      out += logo(x, y, model);
    }
    y += DOT;
  }
  return out;
}

/** The bytes as base64, in chunks that the call stack can spread. */
function base64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}

/** The picture of a run with its verdict over it, as an SVG of `CARD_SIZE` units on a side. */
export async function cardSvg(
  picture: { bytes: Uint8Array; mediaType: string },
  verdict: RunVerdict,
): Promise<string> {
  await loadWasm();
  const image = `<image href="data:${picture.mediaType};base64,${base64(picture.bytes)}" width="${CARD_SIZE}" height="${CARD_SIZE}" preserveAspectRatio="xMidYMid slice"/>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_SIZE}" height="${CARD_SIZE}" viewBox="0 0 ${CARD_SIZE} ${CARD_SIZE}">` +
    `<defs><linearGradient id="gemini" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${LOGO.gemini.gradient[0]}"/><stop offset="1" stop-color="${LOGO.gemini.gradient[1]}"/></linearGradient></defs>` +
    image +
    label(verdict) +
    votes(verdict) +
    "</svg>"
  );
}

/** What the card of a run shows: its picture and its verdict. Changing either makes a new card. */
export function cardVersion(image: string, verdict: RunVerdict | null): string {
  let hash = 2166136261;
  for (const char of JSON.stringify(verdict)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return `${image}.${(hash >>> 0).toString(36)}`;
}

/** The picture with its verdict over it, as a PNG. */
export async function cardPng(
  picture: { bytes: Uint8Array; mediaType: string },
  verdict: RunVerdict,
): Promise<Uint8Array> {
  return new Resvg(await cardSvg(picture, verdict), options(CARD_PIXELS)).render().asPng();
}
