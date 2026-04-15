import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { logger } from "../lib/logger";

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const reqLog = (req as unknown as { log?: typeof logger }).log ?? logger;

  if (err instanceof ZodError) {
    reqLog.warn({ validation: err.flatten() }, "request validation failed");
    return res.status(400).json({ error: "Validation failed", details: err.flatten() });
  }
  if (err instanceof Error) {
    const status = (err as { status?: number }).status ?? 500;
    if (status >= 500) {
      reqLog.error({ err, status }, err.message);
    } else {
      reqLog.warn({ err: { message: err.message, status } }, err.message);
    }
    return res.status(status).json({ error: err.message });
  }
  reqLog.error({ err }, "unhandled non-Error thrown");
  res.status(500).json({ error: "Internal server error" });
}

export function httpError(status: number, message: string) {
  const err = new Error(message) as Error & { status: number };
  err.status = status;
  return err;
}
