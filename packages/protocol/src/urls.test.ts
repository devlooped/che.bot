import { expect, test } from "vitest";
import { drive, ok, scripted } from "./fixtures.ts";
import { normalizeUrl } from "./urls.ts";

test("URLs are compared without fragment, www. or trailing slash", () => {
  expect(normalizeUrl("https://WWW.Example.org/a/?q=1#x")).toBe("example.org/a?q=1");
  expect(normalizeUrl(" http://example.org/a ")).toBe(normalizeUrl("https://www.example.org/a/"));
  expect(normalizeUrl("ftp://example.org")).toBeUndefined();
  expect(normalizeUrl("not a url")).toBeUndefined();
});

test("a claim keeps a source its search found when the URL differs only by www. or a trailing slash", () => {
  const { state } = drive({ mode: "quick" }, (call, s) => {
    if (call.key !== "draft:0:grok") return scripted(call, s);
    return ok(
      call,
      {
        answer: "La capital de Australia es Canberra.",
        claims: [
          {
            text: "La capital de Australia es Canberra.",
            confidence: "high",
            sources: ["https://www.example.org/canberra/", "https://example.org/other"],
          },
        ],
      },
      {
        sources: [
          { url: "https://example.org/canberra", title: "Canberra", quote: "the capital" },
          { url: "https://www.example.org/canberra#history", title: "Again", quote: "" },
        ],
      },
    );
  });
  const grok = state.drafts.find((d) => d.model === "grok");
  const claim = state.claims[grok?.claims[0] ?? ""];
  expect(claim?.sources).toEqual(["src1"]);
  // the same page found twice in other forms is one source
  expect(state.sources.filter((s) => s.foundBy === "grok").map((s) => s.url)).toEqual([
    "https://example.org/canberra",
  ]);
});
