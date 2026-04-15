import { AxiosError } from "axios";

type FlattenedZod = {
  formErrors?: string[];
  fieldErrors?: Record<string, string[] | undefined>;
};

/**
 * Extract a single user-readable message from an API error response.
 *
 * Shape the backend returns (see `backend/src/middleware/error.ts`):
 *   {"error":"Validation failed","details":{formErrors,fieldErrors}}
 *   {"error":"Assignee must be in your company"}
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
  return data?.error ?? (err instanceof Error ? err.message : fallback);
}
