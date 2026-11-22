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
    case "not_admin":
      return t.errors.notAdmin;
    case "cannot_rerun":
      return t.errors.cannotRerun;
    case "invalid":
      return t.errors.invalid;
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
    case "deleted":
      return t.errors.runDeleted;
    case "network":
      return t.errors.network;
    default:
      return t.errors.generic;
  }
}

/**
 * The refusal of one field of the admin API (worded in English for the logs, see
 * src/worker/admin.ts), in plain words.
 */
export function fieldErrorText(message: string): string {
  const e = t.admin.fieldErrors;
  if (/^Unknown (role|class)/i.test(message)) return e.unknown;
  if (/takes no effort/i.test(message)) return e.noEffort;
  if (/effort/i.test(message)) return e.effort;
  if (/family|catalog|Gateway id/i.test(message)) return e.family;
  if (/at most/i.test(message)) return e.amountMax;
  if (/amount|positive/i.test(message)) return e.amount;
  return e.other;
}
