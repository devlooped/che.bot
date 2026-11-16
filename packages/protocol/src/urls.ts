// URL is a global of every runtime the protocol runs in (Node, Workers, browsers); the es2023 lib
// of this package does not declare it.
declare const URL: new (
  url: string,
) => { protocol: string; host: string; pathname: string; search: string };

/**
 * The comparison key of a URL: no fragment, no "www.", no trailing slash, host in lower case.
 * Undefined for anything that is not an http(s) URL. The adapter matches the URLs an output cites
 * against its search results with it, and the reducer matches a claim's URLs against its sources.
 */
export function normalizeUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
    const host = parsed.host.toLowerCase().replace(/^www\./, "");
    const path = parsed.pathname.replace(/\/+$/, "");
    return `${host}${path}${parsed.search}`;
  } catch {
    return undefined;
  }
}
