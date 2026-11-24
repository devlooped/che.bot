import { env } from "cloudflare:workers";
import { respond } from "@chebot/driver/testing";
import type { ModelId } from "@chebot/protocol";
import type { FakeResponder } from "@chebot/providers";
import { describe, expect, test } from "vitest";
import { handle } from "../src/worker/api.ts";
import { TLDR_TRIES } from "../src/worker/run-object.ts";
import { previewTags } from "../src/worker/share.ts";
import { api, as, eventsOf, fakes, ORIGIN, paidRun, QUESTION, runAlarms } from "./helpers.ts";

const user = () => `user-${crypto.randomUUID()}`;
/** The summary of the driver's fake helper: the question asks two facts, a point each. */
const TLDR = "📊 La capital de Australia es Canberra.\n📊 En Canberra viven unas 470.000 personas.";

/** The prose run of the driver, its drafts taking the question for one of yes or no. */
const RATINGS: Record<ModelId, string> = {
  grok: "true",
  claude: "true",
  openai: "depends",
  gemini: "true",
};
const asQuestion: FakeResponder = (req) => {
  const outcome = respond(req);
  const [kind, , seat] = req.callKey.split(":");
  if (kind !== "draft" || !("output" in outcome)) return outcome;
  const verdict = { kind: "question", rating: RATINGS[seat as ModelId] };
  return { ...outcome, output: { ...(outcome.output as object), verdict } };
};

/** The app's page as the Worker answers it, with an index.html of the assets. */
const page = (path: string) =>
  handle(new Request(`${ORIGIN}${path}`), {
    ...env,
    ASSETS: {
      fetch: async () =>
        new Response(
          "<!doctype html><html><head><title>che.bot</title></head><body></body></html>",
          {
            headers: { "content-type": "text/html; charset=utf-8" },
          },
        ),
    } as unknown as Fetcher,
  });

const listed = (id: string) =>
  env.DB.prepare("SELECT verdict, tldr FROM runs WHERE id = ?")
    .bind(id)
    .first<{ verdict: string | null; tldr: string | null }>();

describe("the card of a question", () => {
  test("a completed run lists its verdict and its summary; the page gets the summary as an event", async () => {
    const { provider } = fakes({ respond: asQuestion });
    const { id, stub } = await paidRun(user());
    await runAlarms(stub);
    const verdict = {
      kind: "question",
      outcome: "true",
      votes: { grok: "true", claude: "true", openai: "depends", gemini: "true" },
    };
    expect(await listed(id)).toEqual({ verdict: JSON.stringify(verdict), tldr: TLDR });

    const log = await eventsOf(stub);
    const drafted = log.filter((e) => e.type === "draft.completed");
    expect(drafted.map((e) => e.type === "draft.completed" && e.verdict?.rating)).toEqual([
      "true",
      "true",
      "depends",
      "true",
    ]);
    expect(log.at(-1)).toMatchObject({ type: "answer.summarized", text: TLDR });

    // The helper reads the question and the answer, once.
    const calls = provider.calls.filter((c) => c.callKey.startsWith("tldr:"));
    expect(calls.map((c) => c.callKey)).toEqual(["tldr:1"]);
    expect(calls[0]?.prompt).toContain(QUESTION);
    expect(calls[0]?.prompt).toContain("Canberra");
    const spend = (await stub.spend())?.rows.stage.find((r) => r.label === "tldr");
    expect(spend).toMatchObject({ calls: 1, costUsd: 0.001 });

    const { runs } = (await (await api("/api/runs", { headers: as("otro") })).json()) as {
      runs: { id: string; verdict: unknown; tldr: string | null }[];
    };
    expect(runs.find((r) => r.id === id)).toMatchObject({ verdict, tldr: TLDR });
  });

  test("a helper that fails is tried again on the alarms, at most TLDR_TRIES; the run stays completed", async () => {
    const { provider } = fakes({
      calls: Object.fromEntries(
        Array.from({ length: TLDR_TRIES + 1 }, (_, i) => [`tldr:${i + 1}`, { kind: "error" }]),
      ),
    });
    const { id, stub } = await paidRun(user());
    await runAlarms(stub);
    expect(provider.calls.filter((c) => c.callKey.startsWith("tldr:"))).toHaveLength(TLDR_TRIES);
    expect((await stub.summary())?.status).toBe("completed");
    // The drafts of the driver take the question for a fact.
    expect(await listed(id)).toEqual({
      verdict: JSON.stringify({ kind: "fact", outcome: null, votes: {} }),
      tldr: null,
    });
    expect((await eventsOf(stub)).some((e) => e.type === "answer.summarized")).toBe(false);
  });
});

describe("the preview of a shared link", () => {
  test("the page of a run has its question with the emoji of its verdict, its summary and its picture", async () => {
    fakes({ respond: asQuestion });
    const { id, stub } = await paidRun(user());
    await runAlarms(stub);
    const summary = await stub.summary();
    const html = await (await page(`/r/${summary?.link}`)).text();
    const image = `${ORIGIN}/api/runs/${id}/image?v=${summary?.image}`;
    expect(html).toContain(`<title>${QUESTION} 👍 · che.bot</title>`);
    expect(html).toContain(`<meta property="og:title" content="${QUESTION} 👍" />`);
    expect(html).toContain(
      `<meta property="og:description" content="${TLDR.replace("\n", " ")}" />`,
    );
    expect(html).toContain(`<meta property="og:image" content="${image}" />`);
    expect(html).toContain(`<meta name="twitter:image" content="${image}" />`);
    expect(html).toContain(`<meta name="twitter:card" content="summary_large_image" />`);
    expect(html).toContain(`<meta property="og:url" content="${ORIGIN}/r/${summary?.link}" />`);
  });

  test("a deleted run, or one that does not exist, has none", async () => {
    fakes();
    const owner = user();
    const { id, stub } = await paidRun(owner);
    await runAlarms(stub);
    // Its page (by its link, or by its UUID when a test of the same second took its words) has
    // the preview until its owner deletes it.
    const path = `/r/${(await stub.summary())?.link ?? id}`;
    expect(await (await page(path)).text()).toContain("og:title");
    expect((await api(`/api/runs/${id}`, { method: "DELETE", headers: as(owner) })).status).toBe(
      204,
    );
    expect(await (await page(path)).text()).not.toContain("og:title");
    expect(await (await page("/r/zzzzzzz-nada")).text()).not.toContain("og:title");
  });

  test("the texts of the tags are escaped", () => {
    const { html } = previewTags(
      {
        id: "x",
        question: 'Un "texto" <b>',
        status: "completed",
        link: null,
        image: null,
        verdict: null,
        tldr: null,
        deleted: false,
      },
      ORIGIN,
    );
    expect(html).toContain('content="Un &quot;texto&quot; &lt;b&gt;"');
    expect(html).toContain('<meta name="twitter:card" content="summary" />');
    expect(html).not.toContain("og:image");
  });
});
