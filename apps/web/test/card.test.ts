import { env } from "cloudflare:workers";
import { ONE_PIXEL_PNG } from "@chebot/providers";
import { describe, expect, test } from "vitest";
import { cardJpeg, cardSvg, cardVersion, rememberCard } from "../src/worker/card.ts";
import { api, fakes, paidRun, runAlarms } from "./helpers.ts";

const JPEG = [0xff, 0xd8, 0xff];

const user = () => `user-${crypto.randomUUID()}`;

const PICTURE = { bytes: ONE_PIXEL_PNG, mediaType: "image/png" };

const CLAIM = {
  kind: "claim",
  outcome: "depends",
  votes: { openai: "depends", gemini: "depends", grok: "depends", claude: "false" },
} as const;

describe("the verdict over the picture of a shared link", () => {
  test("the card says the outcome, what the question asks and the rows of votes", async () => {
    const svg = await cardSvg(PICTURE, CLAIM);
    expect(svg).toContain(">Engañoso</text>");
    expect(svg).toContain(">AFIRMACIÓN</text>");
    // the outcome's row first: its mark and the logos of its three models, then the other row
    expect(svg.match(/<circle/g)).toHaveLength(1 + 4 + 4);
    expect(svg).toContain('fill="url(#gemini)"');
  });

  test("a fact has the label alone; a question that was not rated, too", async () => {
    const fact = await cardSvg(PICTURE, { kind: "fact", outcome: null, votes: {} });
    expect(fact).toContain(">Dato</text>");
    expect(fact).not.toContain("AFIRMACI");
    const unrated = await cardSvg(PICTURE, { kind: "question", outcome: null, votes: {} });
    expect(unrated).not.toContain("<text");
  });

  test("the card is encoded as a JPEG", async () => {
    const jpeg = await cardJpeg(PICTURE, CLAIM);
    expect([...jpeg.slice(0, 3)]).toEqual(JPEG);
  });

  test("the version of a card changes with its picture and with its verdict", () => {
    expect(cardVersion("a", CLAIM)).toBe(cardVersion("a", { ...CLAIM }));
    expect(cardVersion("a", CLAIM)).not.toBe(cardVersion("b", CLAIM));
    expect(cardVersion("a", CLAIM)).not.toBe(cardVersion("a", { ...CLAIM, outcome: "false" }));
    expect(cardVersion("a", null)).not.toBe(cardVersion("a", CLAIM));
  });

  test("the card of a run is its picture with the verdict laid over it, as a JPEG", async () => {
    fakes();
    const { id, stub } = await paidRun(user());
    await runAlarms(stub);
    const image = (await stub.summary())?.image ?? "";
    const verdict = JSON.parse(
      (
        await env.DB.prepare("SELECT verdict FROM runs WHERE id = ?")
          .bind(id)
          .first<{ verdict: string }>()
      )?.verdict ?? "null",
    );
    const version = cardVersion(image, verdict);
    const response = await api(`/api/runs/${id}/card?v=${version}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("cache-control")).toContain("immutable");
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual(JPEG);
    expect((await api(`/api/runs/${id}/card`)).headers.get("cache-control")).toBe(
      "public, max-age=300",
    );
    expect((await api(`/api/runs/${crypto.randomUUID()}/card`)).status).toBe(404);
  });

  test("the card is drawn once and kept; another v draws it again, unkept; the rest of the query is ignored", async () => {
    fakes();
    const { id, stub } = await paidRun(user());
    await runAlarms(stub);
    const image = (await stub.summary())?.image ?? "";
    const row = await env.DB.prepare("SELECT verdict FROM runs WHERE id = ?")
      .bind(id)
      .first<{ verdict: string }>();
    const version = cardVersion(image, JSON.parse(row?.verdict ?? "null"));
    expect(await stub.card(version)).toBeNull();

    const get = async (query: string) => {
      const response = await api(`/api/runs/${id}/card${query}`);
      return {
        cache: response.headers.get("cache-control"),
        bytes: new Uint8Array(await response.arrayBuffer()),
      };
    };
    const first = await get(`?v=${version}`);
    expect(await stub.card(version)).toEqual(first.bytes);

    // what is kept is what the next request gets, from the isolate's memory before the object's
    const planted = Uint8Array.of(...JPEG, 1);
    rememberCard(id, version, planted);
    expect((await get(`?v=${version}`)).bytes).toEqual(planted);
    // the page's own v, passed on, changes the URL and nothing else
    expect(await get(`?v=${version}&refresh=6`)).toEqual({ cache: first.cache, bytes: planted });
    expect((await get("?refresh=6")).bytes).toEqual(planted);

    // another v draws it again, with a short cache, and keeps nothing
    const redrawn = await get("?v=test");
    expect(redrawn).toEqual({ cache: "public, max-age=300", bytes: first.bytes });
    expect((await get(`?v=${version}`)).bytes).toEqual(planted);
    expect(await stub.card(version)).toEqual(first.bytes);

    // another picture is another version: the card kept for the old one is not served
    expect(await stub.card(cardVersion("otra", null))).toBeNull();
  });
});
