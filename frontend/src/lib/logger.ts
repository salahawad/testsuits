type Level = "debug" | "info" | "warn" | "error";

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const envLevel = (import.meta.env.VITE_LOG_LEVEL as Level) ?? (import.meta.env.PROD ? "info" : "debug");
const minLevel = LEVELS[envLevel] ?? LEVELS.info;

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "/api";
const BEACON_URL = `${API_BASE}/_client-log`;
const RELEASE = (import.meta.env.VITE_RELEASE as string | undefined) ?? "dev";

// One ID per tab, survives route changes but not reloads — lets us stitch
// together multiple client errors that come from the same session.
const SESSION_ID =
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

// sendBeacon can't send auth headers, so we pull the logged-in identity
// straight from the Zustand-persisted localStorage slot. Reads are cheap; a
// corrupt value falls through to an anonymous report rather than throwing.
function readSessionIdentity(): { userId?: string; userEmail?: string; companyId?: string } {
  try {
    const raw = localStorage.getItem("user");
    if (!raw) return {};
    const user = JSON.parse(raw) as { id?: string; email?: string; company?: { id?: string } };
    return { userId: user.id, userEmail: user.email, companyId: user.company?.id };
  } catch {
    return {};
  }
}

function emit(level: Level, message: string, context?: Record<string, unknown>) {
  if (LEVELS[level] < minLevel) return;
  const record = {
    level,
    message,
    ts: new Date().toISOString(),
    release: RELEASE,
    sessionId: SESSION_ID,
    path: typeof location !== "undefined" ? location.pathname : undefined,
    ...readSessionIdentity(),
    ...context,
  };
  const fn = level === "error" ? console.error : level === "warn" ? console.warn : level === "info" ? console.info : console.debug;
  fn(`[${level}]`, message, context ?? "");
  if (level === "error" && !import.meta.env.DEV) {
    try {
      navigator.sendBeacon?.(
        BEACON_URL,
        new Blob([JSON.stringify(record)], { type: "application/json" }),
      );
    } catch {
      /* swallow */
    }
  }
}

export const logger = {
  debug: (msg: string, ctx?: Record<string, unknown>) => emit("debug", msg, ctx),
  info: (msg: string, ctx?: Record<string, unknown>) => emit("info", msg, ctx),
  warn: (msg: string, ctx?: Record<string, unknown>) => emit("warn", msg, ctx),
  error: (msg: string, ctx?: Record<string, unknown>) => emit("error", msg, ctx),
};

if (typeof window !== "undefined") {
  window.addEventListener("error", (event) => {
    logger.error("window.onerror", {
      message: event.message,
      source: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      stack: event.error?.stack,
    });
  });
  window.addEventListener("unhandledrejection", (event) => {
    logger.error("unhandledrejection", {
      reason: (event.reason as Error)?.message ?? String(event.reason),
      stack: (event.reason as Error)?.stack,
    });
  });
}
