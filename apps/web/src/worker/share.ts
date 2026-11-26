import { verdictEmoji } from "@chebot/protocol";
import { CARD_PIXELS, CARD_TYPE, cardVersion } from "./card.ts";
import type { RunShare } from "./settings.ts";

// The preview of the link of a run where it is shared (WhatsApp, X, Slack...): the crawlers of those
// sites read the meta tags of the page and run no script, so the Worker writes them into the app's
// index.html. The preview is the question, with the emoji of its verdict, its summary (the points
// on one line, each after its emoji) and its picture, with the verdict over it as on the page.

const attribute = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * The meta tags of the preview of a run, as HTML; `origin`, the site's. `refresh`, the `v` of the
 * page's URL: it goes on to the URL of the picture, so that sharing the link with another `v` makes
 * an app that keeps the previews it showed (WhatsApp) fetch the picture again.
 */
export function previewTags(
  share: RunShare,
  origin: string,
  refresh: string | null = null,
): { title: string; html: string } {
  const emoji = verdictEmoji(share.verdict);
  const title = emoji ? `${share.question} ${emoji}` : share.question;
  const description = share.tldr?.replaceAll("\n", " ") ?? share.question;
  const url = new URL(`/r/${share.link ?? share.id}`, origin).href;
  let image: string | null = null;
  if (share.image) {
    const card = new URL(`/api/runs/${share.id}/card`, origin);
    card.searchParams.set("v", cardVersion(share.image, share.verdict));
    if (refresh) card.searchParams.set("refresh", refresh);
    image = card.href;
  }
  // with a verdict, the picture is the card: a JPEG of a known size
  const card = share.verdict
    ? ([
        ["property", "og:image:type", CARD_TYPE],
        ["property", "og:image:width", String(CARD_PIXELS)],
        ["property", "og:image:height", String(CARD_PIXELS)],
      ] satisfies [string, string, string][])
    : [];
  const tags: [string, string, string][] = [
    ["name", "description", description],
    ["property", "og:type", "article"],
    ["property", "og:site_name", "che.bot"],
    ["property", "og:url", url],
    ["property", "og:title", title],
    ["property", "og:description", description],
    ...(image
      ? ([
          ["property", "og:image", image],
          ...card,
          ["property", "og:image:alt", share.question],
          ["name", "twitter:image", image],
        ] satisfies [string, string, string][])
      : []),
    ["name", "twitter:card", image ? "summary_large_image" : "summary"],
    ["name", "twitter:title", title],
    ["name", "twitter:description", description],
  ];
  return {
    title: `${title} · che.bot`,
    html: tags
      .map(([attr, name, content]) => `<meta ${attr}="${name}" content="${attribute(content)}" />`)
      .join(""),
  };
}

/** The page of the app with the preview of the run in its head. */
export function withPreview(
  page: Response,
  share: RunShare,
  origin: string,
  refresh: string | null = null,
): Response {
  const { title, html } = previewTags(share, origin, refresh);
  return new HTMLRewriter()
    .on("title", {
      element(el) {
        el.setInnerContent(title);
      },
    })
    .on("head", {
      element(el) {
        el.append(html, { html: true });
      },
    })
    .transform(page);
}
