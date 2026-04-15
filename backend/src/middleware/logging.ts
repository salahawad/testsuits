import { RequestHandler } from "express";
import pinoHttp from "pino-http";
import { nanoid } from "nanoid";
import { logger } from "../lib/logger";

export const httpLogger: RequestHandler = pinoHttp({
  logger,
  genReqId: (req, res) => {
    const existing = (req.headers["x-request-id"] as string | undefined) ?? nanoid(10);
    res.setHeader("x-request-id", existing);
    return existing;
  },
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },
  customProps: (req) => {
    const user = (req as unknown as { user?: { id: string; email: string } }).user;
    return user ? { userId: user.id, userEmail: user.email } : {};
  },
  serializers: {
    req: (req) => ({ id: req.id, method: req.method, url: req.url }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
}) as unknown as RequestHandler;
