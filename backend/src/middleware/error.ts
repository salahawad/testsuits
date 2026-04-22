import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { logger } from "../lib/logger";

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const reqLog = (req as unknown as { log?: typeof logger }).log ?? logger;

  if (err instanceof ZodError) {
    reqLog.warn({ validation: err.flatten() }, "request validation failed");
    return res.status(400).json({ error: "VALIDATION_FAILED", details: err.flatten() });
  }
  if (err instanceof Error) {
    const status = (err as { status?: number }).status ?? 500;
    if (status >= 500) {
      reqLog.error({ err, status }, err.message);
      // Never leak raw exception messages (Prisma stack traces, DB driver
      // errors, third-party SDK strings) into the response body. 4xx errors
      // are thrown via httpError() with curated machine keys — those pass
      // through below; unhandled 5xx always returns a stable code.
      return res.status(status).json({ error: "INTERNAL_SERVER_ERROR" });
    }
    reqLog.warn({ err: { message: err.message, status } }, err.message);
    return res.status(status).json({ error: err.message });
  }
  reqLog.error({ err }, "unhandled non-Error thrown");
  res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
}

export function httpError(status: number, message: string) {
  const err = new Error(message) as Error & { status: number };
  err.status = status;
  return err;
}
