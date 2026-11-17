import type { FailureReason, LoggedEvent, QuestionClass, Stage } from "@chebot/protocol";

// The HTTP API of the Worker (src/worker/api.ts), as the browser calls it. A refusal becomes an
// ApiError with a `kind` the pages turn into plain words (t.errors).

export type ApiErrorKind =
  | "not_signed_in"
  | "no_access"
  | "not_admin"
  | "not_yours"
  | "too_many"
  | "too_long"
  | "empty"
  | "daily_limit"
  | "not_found"
  | "invalid"
  | "cannot_rerun"
  | "network"
  | "other";

export class ApiError extends Error {
  constructor(
    readonly kind: ApiErrorKind,
    readonly status: number,
    message: string,
    /** The refusal of each field, as the API words it (`errors` of a 400 of the admin routes). */
    readonly fields: Record<string, string> = {},
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
  /** Why a failed run failed; null otherwise. */
  failure: FailureReason | null;
  /** The caller owns the run: the page offers to pay, or to run a failed question again. */
  mine: boolean;
}

/** A row of GET /api/me/runs. */
export interface MyRun {
  id: string;
  /** ISO 8601. */
  createdAt: string;
  question: string;
  class: QuestionClass | null;
  status: RunStatus;
  amount: number | null;
}

/** The family and effort of a role (an effort of null: the model's own). */
export interface ModelChoice {
  family: string;
  effort: string | null;
}

/** GET /api/admin/models. */
export interface AdminModels {
  roles: {
    role: string;
    kind: string;
    default: ModelChoice;
    /** Null: the role uses its default. */
    setting: ModelChoice | null;
  }[];
  families: { family: string; kind: string; latest: string; efforts: string[] }[];
}

export interface Price {
  class: QuestionClass;
  amount: number;
  currency: string;
}

/** Gives the access token of the signed-in user, or null when nobody is signed in. */
export type TokenSource = () => Promise<string | null>;

export const MAX_QUESTION_CHARS = 2_000;

/** The paid attempt of a question and its one free rerun (MAX_ATTEMPTS of src/worker/run-object.ts). */
export const MAX_ATTEMPTS = 2;

interface ErrorBody {
  error?: string;
  reason?: string;
  errors?: Record<string, string>;
}

function kindOf(status: number, path: string, body: ErrorBody): ApiErrorKind {
  if (status === 401) return "not_signed_in";
  if (status === 403) {
    if (path === "/api/runs") return "no_access";
    return path.startsWith("/api/admin/") ? "not_admin" : "not_yours";
  }
  if (status === 404) return "not_found";
  if (status === 409 && path.endsWith("/rerun")) return "cannot_rerun";
  if (status === 429) return "too_many";
  if (status === 413) return "too_long";
  if (status === 503 && body.reason === "daily_cap") return "daily_limit";
  if (status === 400 && /at most/i.test(body.error ?? "")) return "too_long";
  if (status === 400 && /write a question/i.test(body.error ?? "")) return "empty";
  if (status === 400 && body.errors) return "invalid";
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
    const body = (await response.json().catch(() => ({}))) as ErrorBody;
    throw new ApiError(
      kindOf(response.status, path, body),
      response.status,
      body.error ?? response.statusText,
      body.errors ?? {},
    );
  }

  return {
    ask: (question: string) =>
      call<Quote>("/api/runs", { method: "POST", body: JSON.stringify({ question }) }),
    pay: (runId: string) => call<RunSummary>(`/api/runs/${runId}/pay`, { method: "POST" }),
    /** The free rerun of a paid run that failed. */
    rerun: (runId: string) => call<RunSummary>(`/api/runs/${runId}/rerun`, { method: "POST" }),
    remove: (runId: string) => call<null>(`/api/runs/${runId}`, { method: "DELETE" }),
    myRuns: () => call<{ runs: MyRun[] }>("/api/me/runs").then((r) => r.runs),
    models: () => call<AdminModels>("/api/admin/models"),
    /** Changes some roles; null puts a role back on its default. */
    saveModels: (settings: Record<string, ModelChoice | null>) =>
      call<AdminModels>("/api/admin/models", {
        method: "PUT",
        body: JSON.stringify({ settings }),
      }),
    prices: () => call<{ prices: Price[] }>("/api/admin/prices").then((r) => r.prices),
    /** The amounts in ARS; a value that is not a number is sent as null and refused by the API. */
    savePrices: (prices: Partial<Record<QuestionClass, number | null>>) =>
      call<{ prices: Price[] }>("/api/admin/prices", {
        method: "PUT",
        body: JSON.stringify({ prices }),
      }).then((r) => r.prices),
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
