import { env } from "cloudflare:workers";
import { ONE_PIXEL_PNG } from "@chebot/providers";
import { describe, expect, test } from "vitest";
import { cardPng, cardSvg, cardVersion } from "../src/worker/card.ts";
import { api, fakes, paidRun, runAlarms } from "./helpers.ts";

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

  test("the card is rasterized to a PNG", async () => {
    const png = await cardPng(PICTURE, CLAIM);
    expect([...png.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  test("the version of a card changes with its picture and with its verdict", () => {
    expect(cardVersion("a", CLAIM)).toBe(cardVersion("a", { ...CLAIM }));
    expect(cardVersion("a", CLAIM)).not.toBe(cardVersion("b", CLAIM));
    expect(cardVersion("a", CLAIM)).not.toBe(cardVersion("a", { ...CLAIM, outcome: "false" }));
    expect(cardVersion("a", null)).not.toBe(cardVersion("a", CLAIM));
  });

  test("the card of a run is its picture with the verdict laid over it, as a PNG", async () => {
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
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toContain("immutable");
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect([...bytes.slice(0, 2)]).toEqual([0x89, 0x50]);
    expect((await api(`/api/runs/${id}/card`)).headers.get("cache-control")).toBe(
      "public, max-age=300",
    );
    expect((await api(`/api/runs/${crypto.randomUUID()}/card`)).status).toBe(404);
  });
});
