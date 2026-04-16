import { AxiosError } from "axios";
import i18n from "../i18n";

type FlattenedZod = {
  formErrors?: string[];
  fieldErrors?: Record<string, string[] | undefined>;
};

/**
 * Returns true when value looks like an UPPER_SNAKE_CASE machine key
 * (e.g. "INVALID_CREDENTIALS", "PROJECT_NOT_FOUND").
 */
function isMachineKey(value: string): boolean {
  return /^[A-Z][A-Z0-9_]+$/.test(value);
}

/**
 * Extract a single user-readable message from an API error response.
 *
 * Shape the backend returns (see `backend/src/middleware/error.ts`):
 *   {"error":"VALIDATION_FAILED","details":{formErrors,fieldErrors}}
 *   {"error":"ASSIGNEE_NOT_IN_COMPANY"}
 *
 * When the error value is an UPPER_SNAKE_CASE machine key, it is translated
 * via i18next (`errors.<KEY>`) so the user sees localised text.
 *
 * We prefer the first field-specific message so the user knows which input is
 * wrong; fall back to the top-level error, then a supplied fallback.
 */
export function apiErrorMessage(err: unknown, fallback: string): string {
  if (!err) return fallback;
  const ax = err as AxiosError<{ error?: string; details?: FlattenedZod }>;
  const data = ax.response?.data;
  const fieldErrors = data?.details?.fieldErrors;
  if (fieldErrors) {
    for (const [field, msgs] of Object.entries(fieldErrors)) {
      if (msgs && msgs.length > 0) return `${field}: ${msgs[0]}`;
    }
  }
  const formErrors = data?.details?.formErrors;
  if (formErrors && formErrors.length > 0) return formErrors[0];

  const raw = data?.error;
  if (raw && isMachineKey(raw)) {
    const key = `errors.${raw}`;
    const translated = i18n.t(key);
    // i18next returns the key itself when there's no translation
    if (translated !== key) return translated;
  }

  return raw ?? (err instanceof Error ? err.message : fallback);
}
