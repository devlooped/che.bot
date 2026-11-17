import { describe, expect, test } from "vitest";
import { createJobsClient, JobsError } from "../src/worker/jobs.ts";

// The client of the jobs service against a scripted fetch: the requests it sends and how it
// reads the answers. No network.

function service(answers: Response[]) {
  const sent: { method: string; url: string; auth: string | null; body: unknown }[] = [];
  const client = createJobsClient({
    url: "https://jobs.example/",
    token: "jobs-token",
    fetch: async (input, init) => {
      const request = new Request(input, init);
      const text = await request.text();
      sent.push({
        method: request.method,
        url: request.url,
        auth: request.headers.get("authorization"),
        body: text ? JSON.parse(text) : null,
      });
      const answer = answers.shift();
      if (!answer) throw new Error("no answer scripted");
      return answer;
    },
  });
  return { client, sent };
}

const ID = "9b2c7c1e-0b55-4d4b-9a59-3f1f0c1d2e3f";

describe("the jobs client", () => {
  test("enqueue sends the job with its price and automation; a second enqueue is not an error", async () => {
    const { client, sent } = service([
      Response.json({ id: ID, status: "created" }, { status: 201 }),
      new Response("Already enqueued.", { status: 409 }),
    ]);
    const job = {
      id: ID,
      actor: "auth0|ada",
      name: "che.bot: pregunta compleja y muy larga de verdad",
      amount: 10000,
      currency: "ARS",
      hook: { url: "https://chebot.test/api/pay/hook", token: "run-token" },
    };
    await client.enqueue(job);
    await client.enqueue(job);
    expect(sent[0]).toEqual({
      method: "POST",
      url: `https://jobs.example/jobs/${ID}`,
      auth: "Bearer jobs-token",
      body: {
        id: ID,
        actor: "auth0|ada",
        name: "che.bot: pregunta compleja y m",
        amount: 10000,
        currency: "ARS",
        automation: { url: "https://chebot.test/api/pay/hook", token: "run-token" },
      },
    });
  });

  test("a refusal is a JobsError; a 4xx is permanent, a 5xx or 429 is not", async () => {
    const { client } = service([
      new Response("Automation URL must be https.", { status: 400 }),
      new Response("busy", { status: 503 }),
    ]);
    const job = {
      id: ID,
      actor: "a",
      name: "n",
      amount: 1,
      currency: "ARS",
      hook: { url: "http://x", token: "t" },
    };
    const first = await client.enqueue(job).catch((e: unknown) => e);
    expect(first).toBeInstanceOf(JobsError);
    expect((first as JobsError).permanent).toBe(true);
    const second = await client.enqueue(job).catch((e: unknown) => e);
    expect((second as JobsError).permanent).toBe(false);
    expect(new JobsError(429, "slow").permanent).toBe(false);
  });

  test("get reads the status and the QR; cancel and finish end the job", async () => {
    const { client, sent } = service([
      Response.json({
        id: ID,
        status: "pending",
        message: null,
        pay: { amount: 1, currency: "ARS", qr: "QR" },
      }),
      Response.json({ id: ID, status: "created", message: null }),
      Response.json({ id: ID, status: "canceled" }),
      new Response("Not found.", { status: 404 }),
      new Response("Not cancellable.", { status: 409 }),
      Response.json({ id: ID, status: "done" }),
      new Response("Not ready.", { status: 409 }),
      Response.json({ id: ID, status: "done", message: "La respuesta está lista." }),
    ]);
    expect(await client.get(ID)).toEqual({ status: "pending", qr: "QR", message: null });
    expect(await client.get(ID)).toEqual({ status: "created", qr: null, message: null });
    await client.cancel(ID);
    await client.cancel(ID);
    const notCancellable = await client.cancel(ID).catch((e: unknown) => e);
    expect((notCancellable as JobsError).status).toBe(409);
    await client.finish(ID, "done", "La respuesta está lista.");
    await client.finish(ID, "done", "La respuesta está lista."); // the first answer was lost
    expect(sent.map((s) => s.method)).toEqual([
      "GET",
      "GET",
      "DELETE",
      "DELETE",
      "DELETE",
      "PATCH",
      "PATCH",
      "GET",
    ]);
    expect(sent[5]?.body).toEqual({ status: "done", message: "La respuesta está lista." });
  });
});
