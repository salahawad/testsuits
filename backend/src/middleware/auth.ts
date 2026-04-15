import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

export type AuthedUser = {
  id: string;
  email: string;
  role: "MANAGER" | "TESTER";
  companyId: string;
};

export interface AuthedRequest extends Request {
  user?: AuthedUser;
}

const SECRET = process.env.JWT_SECRET ?? "change-me-in-production";

export function signToken(payload: AuthedUser) {
  return jwt.sign(payload, SECRET, { expiresIn: "7d" });
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const decoded = jwt.verify(header.slice(7), SECRET) as AuthedUser;
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

export function requireManager(req: AuthedRequest, res: Response, next: NextFunction) {
  if (req.user?.role !== "MANAGER") {
    return res.status(403).json({ error: "Manager role required" });
  }
  next();
}
