import axios, { AxiosError, AxiosRequestConfig } from "axios";
import { toast } from "sonner";
import i18n from "../i18n";

// Augment axios' request config with a project-specific `silent` flag so
// callers can opt out of the global error-toast without a cast.
declare module "axios" {
  export interface AxiosRequestConfig {
    silent?: boolean;
  }
}

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "http://localhost:4000/api",
});

// Re-export for convenience when typing a custom config inline.
export type ApiRequestConfig = AxiosRequestConfig;

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  const trustToken = localStorage.getItem("trustToken");
  if (trustToken) config.headers["X-Trust-Token"] = trustToken;
  return config;
});

// Paths that opt OUT of the global error toast — those that surface errors
// inline via their own UI (login/reset/invite/forgot). Everything else gets a
// toast so transient failures don't vanish silently.
const SILENT_PATHS = ["/auth/login", "/auth/signup", "/auth/forgot", "/auth/reset", "/auth/accept-invite", "/auth/verify-email", "/auth/resend-verification", "/2fa/authenticate"];

// Key used to pass a reason from an interceptor-forced redirect into the next
// login render (so "session revoked" is surfaced once there, then cleared).
export const LOGIN_FLASH_KEY = "ts_login_flash";

function shouldSuppressToast(err: AxiosError) {
  const url = err.config?.url ?? "";
  if (SILENT_PATHS.some((p) => url.endsWith(p))) return true;
  if ((err.config as { silent?: boolean } | undefined)?.silent) return true;
  return false;
}

api.interceptors.response.use(
  (r) => r,
  (error: AxiosError<{ error?: string }>) => {
    const t = i18n.t.bind(i18n);
    const status = error.response?.status;
    const onLogin = window.location.pathname.startsWith("/login");

    // Network-level failure (no response, request timed out, CORS blocked).
    if (!error.response) {
      if (!shouldSuppressToast(error)) toast.error(t("errors.network"));
      return Promise.reject(error);
    }

    if (status === 401) {
      // Don't redirect when we're already on a public page; the page will
      // surface the error inline and avoid a disorienting redirect loop.
      const reason = error.response.data?.error ?? "";
      const msg =
        /revoked/i.test(reason) ? t("errors.session_revoked")
        : /expired/i.test(reason) ? t("errors.session_expired")
        : reason;
      if (!onLogin) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        localStorage.removeItem("trustToken");
        if (msg) localStorage.setItem(LOGIN_FLASH_KEY, msg);
        window.location.href = "/login";
      }
      return Promise.reject(error);
    }

    if (status === 423) {
      const msg = t("errors.account_locked");
      if (!onLogin) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        localStorage.removeItem("trustToken");
        localStorage.setItem(LOGIN_FLASH_KEY, msg);
        window.location.href = "/login";
      }
      return Promise.reject(error);
    }

    if (!shouldSuppressToast(error)) {
      const translate = (key: string) => t(`errors.${key}`, { defaultValue: key });
      if (status === 403) {
        const code = error.response.data?.error;
        toast.error(code ? translate(code) : t("errors.forbidden"));
      } else if (status && status >= 500) {
        toast.error(t("errors.server"));
      } else if (status && status >= 400) {
        // 4xx with a server-sent machine key (validation, 409, 404): translate
        // via errors.* and fall back to the raw key so nothing is silently
        // dropped if a translation is missing.
        const code = error.response.data?.error;
        if (code) toast.error(translate(code));
      }
    }
    return Promise.reject(error);
  },
);
