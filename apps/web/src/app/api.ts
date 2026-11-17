import type { LoggedEvent, QuestionClass, Stage } from "@chebot/protocol";

// The HTTP API of the Worker (src/worker/api.ts), as the browser calls it. A refusal becomes an
// ApiError with a `kind` the pages turn into plain words (t.errors).

export type ApiErrorKind =
  | "not_signed_in"
  | "no_access"
  | "not_yours"
  | "too_many"
  | "too_long"
  | "empty"
  | "daily_limit"
  | "not_found"
  | "network"
  | "other";

export class ApiError extends Error {
  constructor(
    readonly kind: ApiErrorKind,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface Quote {
  runId: string;
  class: QuestionClass;
  amount: number;
  currency: string;
}

export type RunStatus =
  | "quoted"
  | "awaiting_payment"
  | "running"
  | "completed"
  | "failed"
  | "expired";

/** GET /api/runs/:id. */
export interface RunSummary {
  id: string;
  question: string;
  class: QuestionClass;
  amount: number;
  currency: string;
  status: RunStatus;
  stage: Stage | null;
  version: number | null;
  lastSeq: number;
  attempt: number;
  createdAt: number;
  /** The caller owns the run: the page offers to pay. */
  mine: boolean;
}

/** Gives the access token of the signed-in user, or null when nobody is signed in. */
export type TokenSource = () => Promise<string | null>;

export const MAX_QUESTION_CHARS = 2_000;

function kindOf(status: number, path: string, body: { error?: string; reason?: string }) {
  if (status === 401) return "not_signed_in";
  if (status === 403) return path === "/api/runs" ? "no_access" : "not_yours";
  if (status === 404) return "not_found";
  if (status === 429) return "too_many";
  if (status === 413) return "too_long";
  if (status === 503 && body.reason === "daily_cap") return "daily_limit";
  if (status === 400 && /at most/i.test(body.error ?? "")) return "too_long";
  if (status === 400 && /write a question/i.test(body.error ?? "")) return "empty";
  return "other";
}

export function createApi(token: TokenSource, base = "") {
  async function call<T>(path: string, init: RequestInit = {}, auth = true): Promise<T> {
    const headers = new Headers(init.headers);
    if (auth) {
      const value = await token();
      if (value) headers.set("authorization", `Bearer ${value}`);
    }
    if (init.body) headers.set("content-type", "application/json");
    let response: Response;
    try {
      response = await fetch(`${base}${path}`, { ...init, headers });
    } catch (error) {
      throw new ApiError("network", 0, String(error));
    }
    if (response.ok) return (response.status === 204 ? null : await response.json()) as T;
    const body = (await response.json().catch(() => ({}))) as { error?: string; reason?: string };
    throw new ApiError(
      kindOf(response.status, path, body),
      response.status,
      body.error ?? response.statusText,
    );
  }

  return {
    ask: (question: string) =>
      call<Quote>("/api/runs", { method: "POST", body: JSON.stringify({ question }) }),
    pay: (runId: string) => call<RunSummary>(`/api/runs/${runId}/pay`, { method: "POST" }),
    /** With the token when there is one (for `mine`); a token refused does not hide the run. */
    async summary(runId: string): Promise<RunSummary> {
      try {
        return await call<RunSummary>(`/api/runs/${runId}`);
      } catch (error) {
        if (!(error instanceof ApiError && error.kind === "not_signed_in")) throw error;
        return { ...(await call<RunSummary>(`/api/runs/${runId}`, {}, false)), mine: false };
      }
    },
    /** Public: no token, so that a stale token never hides a shared run. */
    events: (runId: string, after: number) =>
      call<{ events: LoggedEvent[] }>(`/api/runs/${runId}/events?after=${after}`, {}, false).then(
        (r) => r.events,
      ),
  };
}

export type Api = ReturnType<typeof createApi>;

/** The URL of the event stream of a run, on the host of the page. */
export function socketUrl(runId: string, after: number, location: Location = window.location) {
  const scheme = location.protocol === "https:" ? "wss:" : "ws:";
  return `${scheme}//${location.host}/api/runs/${runId}/ws?after=${after}`;
}
