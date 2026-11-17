import { ApiError, MAX_QUESTION_CHARS } from "../api.ts";
import { t } from "../i18n/index.ts";

/** A refusal of the API, in plain words. */
export function errorText(error: unknown): string {
  if (!(error instanceof ApiError)) return t.errors.generic;
  switch (error.kind) {
    case "not_signed_in":
      return t.errors.notSignedIn;
    case "no_access":
      return t.errors.noAccess;
    case "not_yours":
      return t.errors.notYours;
    case "too_many":
      return t.errors.tooMany;
    case "too_long":
      return t.errors.tooLong(new Intl.NumberFormat(t.locale).format(MAX_QUESTION_CHARS));
    case "empty":
      return t.errors.empty;
    case "daily_limit":
      return t.errors.dailyLimit;
    case "not_found":
      return t.errors.runNotFound;
    case "network":
      return t.errors.network;
    default:
      return t.errors.generic;
  }
}
