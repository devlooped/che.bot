// The client of the CheBot jobs service (https://jobs.chebot.si, the `chebot-job` skill): the
// payment of a run is a job whose id is the run id. The app enqueues it with the price in ARS and
// an automation hook that points back to POST /api/pay/hook; the service shows a Mercado Pago QR
// and calls the hook once the payment is processed. The app never uploads inputs or outputs: it
// ends the job itself with PATCH.

/** The status of a job, as GET /jobs/:id reports it. */
export type JobStatus = "created" | "pending" | "queued" | "running" | "done" | "failed";

export interface JobSnapshot {
  status: JobStatus;
  /** The Mercado Pago QR payload, present only while the job is pending. */
  qr: string | null;
  /** The last message: the error of a failed job. */
  message: string | null;
}

export interface EnqueueJob {
  /** The run id. */
  id: string;
  /** Who pays: the owner of the run. */
  actor: string;
  /** The Mercado Pago title, at most 30 characters. */
  name: string;
  amount: number;
  /** ARS: the only currency the service takes. */
  currency: string;
  /** The automation the service calls after the payment, with `Bearer {token}`. */
  hook: { url: string; token: string };
}

/** The payment job of a run in the CheBot jobs service. The job id is the run id. */
export interface JobsClient {
  /** POST /jobs/:id. A job that already exists ("Already enqueued.") counts as enqueued. */
  enqueue(job: EnqueueJob): Promise<void>;
  /** GET /jobs/:id. */
  get(id: string): Promise<JobSnapshot>;
  /** DELETE /jobs/:id: cancels a job that was not paid. A job that is gone counts as cancelled. */
  cancel(id: string): Promise<void>;
  /** PATCH /jobs/:id: ends the job with the outcome of the run. A job already ended counts as ended. */
  finish(id: string, status: "done" | "failed", message: string): Promise<void>;
}

/** An answer of the jobs service that is not a success. */
export class JobsError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "JobsError";
  }

  /**
   * A refusal that asking again will not change (a wrong token, a URL that is not https, a bad
   * amount); network failures, 429 and 5xx are worth retrying.
   */
  get permanent(): boolean {
    return this.status >= 400 && this.status < 500 && this.status !== 408 && this.status !== 429;
  }
}

/** Every call gives up after this long; the caller retries on its next alarm. */
const TIMEOUT_MS = 15_000;

export function createJobsClient(options: {
  url: string;
  token: string;
  fetch?: typeof globalThis.fetch;
}): JobsClient {
  const base = options.url.replace(/\/+$/, "");
  const send = options.fetch ?? ((input, init) => globalThis.fetch(input, init));

  async function call(method: string, id: string, body?: unknown): Promise<Response> {
    const response = await send(`${base}/jobs/${encodeURIComponent(id)}`, {
      method,
      headers: {
        authorization: `Bearer ${options.token}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return response;
  }

  async function failure(response: Response, what: string): Promise<JobsError> {
    const text = (await response.text().catch(() => "")).slice(0, 200);
    return new JobsError(response.status, `${what}: ${response.status} ${text}`.trim());
  }

  return {
    async enqueue(job) {
      const response = await call("POST", job.id, {
        id: job.id,
        actor: job.actor,
        name: job.name.slice(0, 30),
        amount: job.amount,
        currency: job.currency,
        automation: { url: job.hook.url, token: job.hook.token },
      });
      if (response.ok) return;
      const error = await failure(response, `enqueue ${job.id}`);
      // A POST whose answer was lost, sent again: the job is there.
      if (response.status === 409 && /already enqueued/i.test(error.message)) return;
      throw error;
    },

    async get(id) {
      const response = await call("GET", id);
      if (!response.ok) throw await failure(response, `get ${id}`);
      const body = (await response.json()) as {
        status?: string;
        message?: string | null;
        pay?: { qr?: string } | null;
      };
      return {
        status: (body.status ?? "created") as JobStatus,
        qr: body.pay?.qr || null,
        message: typeof body.message === "string" ? body.message : null,
      };
    },

    async cancel(id) {
      const response = await call("DELETE", id);
      if (response.ok || response.status === 404) return;
      throw await failure(response, `cancel ${id}`);
    },

    async finish(id, status, message) {
      const response = await call("PATCH", id, { status, message });
      if (response.ok) return;
      const error = await failure(response, `finish ${id}`);
      // "Not ready." after a PATCH whose answer was lost: the job already ended.
      if (response.status === 409) {
        const job = await this.get(id);
        if (job.status === "done" || job.status === "failed") return;
      }
      throw error;
    },
  };
}
