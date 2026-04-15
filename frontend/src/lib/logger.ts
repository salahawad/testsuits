type Level = "debug" | "info" | "warn" | "error";

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const envLevel = (import.meta.env.VITE_LOG_LEVEL as Level) ?? (import.meta.env.PROD ? "info" : "debug");
const minLevel = LEVELS[envLevel] ?? LEVELS.info;

function emit(level: Level, message: string, context?: Record<string, unknown>) {
  if (LEVELS[level] < minLevel) return;
  const record = {
    level,
    message,
    ts: new Date().toISOString(),
    ...context,
  };
  const fn = level === "error" ? console.error : level === "warn" ? console.warn : level === "info" ? console.info : console.debug;
  fn(`[${level}]`, message, context ?? "");
  if (level === "error" && !import.meta.env.DEV) {
    try {
      navigator.sendBeacon?.(
        "/api/_client-log",
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
