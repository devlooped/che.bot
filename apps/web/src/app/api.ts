import type { FailureReason, LoggedEvent, QuestionClass, Stage } from "@chebot/protocol";
import type { AuthUser } from "./auth/types.ts";

// The HTTP API of the Worker (src/worker/api.ts), as the browser calls it, on the origin of the
// page: the browser sends the session cookie with every call. A refusal becomes an ApiError with a
// `kind` the pages turn into plain words (t.errors).

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
  | "cannot_cancel"
  | "deleted"
  | "network"
  | "other";

export class ApiError extends Error {
  constructor(
    readonly kind: ApiErrorKind,
    readonly status: number,
    message: string,
    /** The refusal of each field, as the API words it (`errors` of a 400 of the admin routes). */
    readonly fields: Record<string, string> = {},
    /** Why the API refused, when it says (`reason`: "daily_cap"). */
    readonly reason: string | null = null,
    /** The run asked again in place of a deleted one (`replacedBy` of a 410), if any. */
    readonly replacedBy: string | null = null,
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
  /** How many charts the answer has (0 before they are decided, or when it has none). */
  charts: number;
  /** The public link (runPath), once the helper named the run. */
  link: string | null;
  /** Its owner deleted it: only they read it, and may restore it. */
  deleted: boolean;
  /** The version of the picture of the question (imagePath); null before it has one. */
  image: string | null;
}

/** A card of the home page (GET /api/runs): a question that was asked. */
export interface PublicRun {
  id: string;
  /** ISO 8601. */
  createdAt: string;
  question: string;
  /** Running, completed or failed: the questions that were paid and started. */
  status: RunStatus;
  link: string | null;
  /** The version of its picture; null before it has one. */
  image: string | null;
}

/** The picture of a run at a version: a URL that never changes, cached for good. */
export const imagePath = (runId: string, version: string) =>
  `/api/runs/${runId}/image?v=${encodeURIComponent(version)}`;

/** A row of GET /api/me/runs. */
export interface MyRun {
  id: string;
  /** ISO 8601. */
  createdAt: string;
  question: string;
  class: QuestionClass | null;
  status: RunStatus;
  amount: number | null;
  /** The public link; null until the helper named the run. */
  link: string | null;
  /** When the user deleted it (ISO 8601); null when it is not deleted. */
  deletedAt: string | null;
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

/** How GET /api/runs/:id/spend groups the calls (src/worker/spend.ts). */
export type SpendPivot = "agent" | "model" | "stage";

export interface SpendRow {
  /** A seat (or "classifier"), a model id, or the stage of a call key. */
  label: string;
  calls: number;
  running: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

/** GET /api/runs/:id/spend: what the model calls of a run cost so far, for admins. */
export interface RunSpend {
  totalUsd: number;
  calls: number;
  running: number;
  rows: Record<SpendPivot, SpendRow[]>;
}

export const MAX_QUESTION_CHARS = 2_000;

/** The paid attempt of a question and its one free rerun (MAX_ATTEMPTS of src/worker/run-object.ts). */
export const MAX_ATTEMPTS = 2;

interface ErrorBody {
  error?: string;
  reason?: string;
  errors?: Record<string, string>;
  replacedBy?: string | null;
}

function kindOf(status: number, path: string, body: ErrorBody): ApiErrorKind {
  if (status === 401) return "not_signed_in";
  if (status === 403) {
    if (path === "/api/runs") return "no_access";
    return path.startsWith("/api/admin/") ? "not_admin" : "not_yours";
  }
  if (status === 404) return "not_found";
  if (status === 410) return "deleted";
  if (status === 409 && path.endsWith("/rerun")) return "cannot_rerun";
  if (status === 409 && path.endsWith("/cancel")) return "cannot_cancel";
  if (status === 429) return "too_many";
  if (status === 413) return "too_long";
  if (status === 503 && body.reason === "daily_cap") return "daily_limit";
  if (status === 400 && /at most/i.test(body.error ?? "")) return "too_long";
  if (status === 400 && /write a question/i.test(body.error ?? "")) return "empty";
  if (status === 400 && body.errors) return "invalid";
  return "other";
}

export function createApi(base = "") {
  async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
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
      body.reason ?? null,
      body.replacedBy ?? null,
    );
  }

  return {
    /** The signed-in user, or null. */
    me: () => call<AuthUser | null>("/api/me"),
    /** A quote for a question; `replaces`, a run of the user's it takes the place of once it starts. */
    ask: (question: string, replaces?: string) =>
      call<Quote>("/api/runs", { method: "POST", body: JSON.stringify({ question, replaces }) }),
    pay: (runId: string) => call<RunSummary>(`/api/runs/${runId}/pay`, { method: "POST" }),
    /** The free rerun of a paid run that failed. */
    rerun: (runId: string) => call<RunSummary>(`/api/runs/${runId}/rerun`, { method: "POST" }),
    /** Deletes a run of the user's; `restore` undoes it. */
    remove: (runId: string) => call<null>(`/api/runs/${runId}`, { method: "DELETE" }),
    restore: (runId: string) => call<null>(`/api/runs/${runId}/restore`, { method: "POST" }),
    /** Stops a run of the user's that is in progress and deletes it for good. */
    cancel: (runId: string) => call<null>(`/api/runs/${runId}/cancel`, { method: "POST" }),
    myRuns: () => call<{ runs: MyRun[] }>("/api/me/runs").then((r) => r.runs),
    /** Public: the questions asked, newest first; `after`, the `next` of the page before. */
    runs: (after?: string | null) =>
      call<{ runs: PublicRun[]; next: string | null }>(
        after ? `/api/runs?after=${encodeURIComponent(after)}` : "/api/runs",
      ),
    /** Admin: draws the picture of a run again, with today's models; its new version. */
    redraw: (runId: string) =>
      call<{ image: string }>(`/api/runs/${runId}/image`, { method: "POST" }).then((r) => r.image),
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
    /** Public: the UUID and the link of the run of a link, whole or short. */
    link: (ref: string) =>
      call<{ id: string; link: string }>(`/api/links/${encodeURIComponent(ref)}`),
    /** Public; `mine` says whether the signed-in user owns it. */
    summary: (runId: string) => call<RunSummary>(`/api/runs/${runId}`),
    /** Admin. */
    spend: (runId: string) => call<RunSpend>(`/api/runs/${runId}/spend`),
    /** Public. */
    events: (runId: string, after: number) =>
      call<{ events: LoggedEvent[] }>(`/api/runs/${runId}/events?after=${after}`).then(
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
