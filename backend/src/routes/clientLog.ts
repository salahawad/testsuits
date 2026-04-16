import { Router, RequestHandler } from "express";
import { z } from "zod";
import { logger } from "../lib/logger";

export const clientLogRouter = Router();

// sendBeacon posts as `application/json` but browsers don't always honour the
// type — accept text/plain too and parse it defensively.
const rawJsonBody: RequestHandler = (req, res, next) => {
  if (req.body && typeof req.body === "object") return next();
  let raw = "";
  req.setEncoding("utf8");
  req.on("data", (chunk: string) => {
    raw += chunk;
    if (raw.length > 16 * 1024) req.destroy();
  });
  req.on("end", () => {
    try {
      req.body = raw ? JSON.parse(raw) : {};
      next();
    } catch {
      res.status(400).json({ error: "INVALID_JSON" });
    }
  });
  req.on("error", () => res.status(400).json({ error: "READ_FAILED" }));
};

// Per-IP sliding-window limiter. Unauthenticated traffic — a crash loop in a
// single tab should not flood the log pipeline.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;
const buckets = new Map<string, number[]>();

const rateLimit: RequestHandler = (req, res, next) => {
  const ip = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0].trim() || req.ip || "unknown";
  const now = Date.now();
  const hits = (buckets.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (hits.length >= MAX_PER_WINDOW) {
    return res.status(429).json({ error: "RATE_LIMIT_EXCEEDED" });
  }
  hits.push(now);
  buckets.set(ip, hits);
  // Opportunistic cleanup so the map doesn't grow unbounded.
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (v.every((t) => now - t >= WINDOW_MS)) buckets.delete(k);
    }
  }
  next();
};

const payloadSchema = z.object({
  level: z.enum(["debug", "info", "warn", "error"]).default("error"),
  message: z.string().max(500),
  ts: z.string().datetime().optional(),
  // Arbitrary structured context — capped in depth and length via JSON length.
  // The pino redact config still strips any `password`/`token`/`apiToken` keys.
  stack: z.string().max(8000).optional(),
  source: z.string().max(500).optional(),
  url: z.string().max(1000).optional(),
  lineno: z.number().optional(),
  colno: z.number().optional(),
  reason: z.string().max(2000).optional(),
  release: z.string().max(100).optional(),
  // Session correlation — all client-asserted, never trusted as authorization
  // but invaluable for joining a client crash to a backend request trail.
  sessionId: z.string().max(100).optional(),
  userId: z.string().max(100).optional(),
  userEmail: z.string().max(320).optional(),
  companyId: z.string().max(100).optional(),
  path: z.string().max(500).optional(),
}).passthrough();

clientLogRouter.post("/", rateLimit, rawJsonBody, (req, res) => {
  const parsed = payloadSchema.safeParse(req.body);
  if (!parsed.success) {
    logger.warn({ issues: parsed.error.issues.slice(0, 3) }, "client log rejected");
    return res.status(400).json({ error: "INVALID_PAYLOAD" });
  }
  const { level, message, ...rest } = parsed.data;
  const ip = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0].trim() || req.ip;
  const ua = req.headers["user-agent"];
  const payload = {
    source: "client" as const,
    clientIp: ip,
    userAgent: typeof ua === "string" ? ua.slice(0, 200) : undefined,
    ...rest,
  };
  // Map to the server logger so client errors flow through the same sink,
  // redaction, and request-id correlation as the rest of the app.
  logger[level](payload, message);
  res.status(204).end();
});
