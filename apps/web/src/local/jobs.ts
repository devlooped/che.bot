import type { Env } from "../worker/env.ts";
import { type JobSnapshot, type JobStatus, type JobsClient, JobsError } from "../worker/jobs.ts";

// The jobs service of the local mode: the payment jobs live in a table of the local D1 database,
// so that they survive a restart of the dev server. A job shows its QR at once; `pay` plays the
// user paying it: it calls the run's hook the way the real service does, through `deliver`.

const SCHEMA =
  "CREATE TABLE IF NOT EXISTS local_jobs (id TEXT PRIMARY KEY, actor TEXT NOT NULL, amount REAL NOT NULL, hook_url TEXT NOT NULL, hook_token TEXT NOT NULL, status TEXT NOT NULL, message TEXT)";

interface Row {
  id: string;
  amount: number;
  hook_url: string;
  hook_token: string;
  status: JobStatus;
  message: string | null;
}

/** A Mercado Pago-like QR payload for a job: EMVCo fields, the id as the reference. */
export function fakeQr(id: string, amount: number): string {
  const field = (tag: string, value: string) =>
    `${tag}${String(value.length).padStart(2, "0")}${value}`;
  return [
    field("00", "01"),
    field("01", "12"),
    field("43", `${field("00", "COM.MERCADOLIBRE")}${field("01", id)}`),
    field("52", "0000"),
    field("53", "032"),
    field("54", amount.toFixed(2)),
    field("58", "AR"),
    field("59", "CHE.BOT LOCAL"),
    field("60", "CABA"),
    "6304ABCD",
  ].join("");
}

export function localJobs(env: Pick<Env, "DB">): JobsClient & {
  pay(id: string, deliver: (request: Request) => Promise<Response>): Promise<Response>;
} {
  const db = env.DB;
  const ready = db.prepare(SCHEMA).run();
  const row = async (id: string) => {
    await ready;
    return db.prepare("SELECT * FROM local_jobs WHERE id = ?").bind(id).first<Row>();
  };
  const set = async (id: string, status: JobStatus, message: string | null = null) => {
    await db
      .prepare("UPDATE local_jobs SET status = ?, message = ? WHERE id = ?")
      .bind(status, message, id)
      .run();
  };
  return {
    async enqueue(job) {
      await ready;
      await db
        .prepare(
          "INSERT OR IGNORE INTO local_jobs (id, actor, amount, hook_url, hook_token, status) VALUES (?, ?, ?, ?, ?, 'pending')",
        )
        .bind(job.id, job.actor, job.amount, job.hook.url, job.hook.token)
        .run();
    },
    async get(id): Promise<JobSnapshot> {
      const job = await row(id);
      if (!job) throw new JobsError(404, "Not found.");
      return {
        status: job.status,
        qr: job.status === "pending" ? fakeQr(id, job.amount) : null,
        message: job.message,
      };
    },
    async cancel(id) {
      const job = await row(id);
      if (!job) return;
      if (job.status !== "created" && job.status !== "pending")
        throw new JobsError(409, "Not cancellable.");
      await db.prepare("DELETE FROM local_jobs WHERE id = ?").bind(id).run();
    },
    async finish(id, status, message) {
      const job = await row(id);
      if (!job || (job.status !== "queued" && job.status !== "running"))
        throw new JobsError(409, "Not ready.");
      await set(id, status, message);
    },
    async pay(id, deliver) {
      const job = await row(id);
      if (!job) return new Response("No such job.", { status: 404 });
      if (job.status !== "pending")
        return new Response("Not waiting for payment.", { status: 409 });
      const response = await deliver(
        new Request(job.hook_url, {
          method: "POST",
          headers: {
            authorization: `Bearer ${job.hook_token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ id, input: [] }),
        }),
      );
      if (response.ok) await set(id, "queued");
      else await set(id, "failed", `Automation returned ${response.status}.`);
      return response;
    },
  };
}
