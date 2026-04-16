import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { createHash } from "crypto";
import { prisma } from "../db";

export type Role = "ADMIN" | "MANAGER" | "TESTER" | "VIEWER";

export type AuthedUser = {
  id: string;
  email: string;
  role: Role;
  companyId: string;
};

export interface AuthedRequest extends Request {
  user?: AuthedUser;
  authSource?: "jwt" | "api-token";
}

const DEFAULT_SECRET = "change-me-in-production";
const SECRET = process.env.JWT_SECRET ?? DEFAULT_SECRET;
if (process.env.NODE_ENV === "production" && (!process.env.JWT_SECRET || SECRET === DEFAULT_SECRET)) {
  // JWTs signed with the default secret would be forgeable by anyone who reads
  // the repo. Refuse to start rather than silently accept a weak configuration.
  // eslint-disable-next-line no-console
  console.error("FATAL: JWT_SECRET is unset or equal to the default value in production. Set a strong unique JWT_SECRET environment variable.");
  process.exit(1);
}

export const API_TOKEN_PREFIX = "ts_";

export function hashApiToken(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

export function signToken(payload: AuthedUser) {
  return jwt.sign(payload, SECRET, { expiresIn: "7d" });
}

/** Short-lived JWT used as a 2FA challenge after password verification. */
export function signChallengeToken(userId: string) {
  return jwt.sign({ sub: userId, purpose: "2fa" }, SECRET, { expiresIn: "5m" });
}

/** Verify a 2FA challenge token. Returns the userId or throws. */
export function verifyChallengeToken(token: string): string {
  const decoded = jwt.verify(token, SECRET) as { sub?: string; purpose?: string };
  if (decoded.purpose !== "2fa" || !decoded.sub) {
    throw new Error("Invalid challenge token");
  }
  return decoded.sub;
}

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const token = header.slice(7);

  // API tokens have a fixed prefix and are stored as sha256 hex. This lets
  // us do a cheap indexed lookup instead of bcrypt-comparing every row.
  if (token.startsWith(API_TOKEN_PREFIX)) {
    try {
      const tokenHash = hashApiToken(token);
      const row = await prisma.apiToken.findUnique({
        where: { tokenHash },
        include: { user: true },
      });
      if (!row) return res.status(401).json({ error: "Invalid API token" });
      // Fire-and-forget lastUsedAt update — don't block the request.
      prisma.apiToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
      req.user = {
        id: row.user.id,
        email: row.user.email,
        role: row.user.role as AuthedUser["role"],
        companyId: row.user.companyId,
      };
      req.authSource = "api-token";
      return next();
    } catch (e) {
      return next(e);
    }
  }

  try {
    const decoded = jwt.verify(token, SECRET) as AuthedUser & { iat: number };
    // Reject JWTs issued before the user's last password change so a reset
    // actually kills all active sessions (otherwise a stolen token keeps
    // working until natural JWT expiry — up to 7d).
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { passwordUpdatedAt: true },
    });
    if (user?.passwordUpdatedAt) {
      const revokedAtSec = Math.floor(user.passwordUpdatedAt.getTime() / 1000);
      if (decoded.iat < revokedAtSec) {
        return res.status(401).json({ error: "Session has been revoked. Please sign in again." });
      }
    }
    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
      companyId: decoded.companyId,
    };
    req.authSource = "jwt";
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

export function requireManager(req: AuthedRequest, res: Response, next: NextFunction) {
  const r = req.user?.role;
  if (r !== "MANAGER" && r !== "ADMIN") {
    return res.status(403).json({ error: "Manager role required" });
  }
  next();
}

export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  if (req.user?.role !== "ADMIN") {
    return res.status(403).json({ error: "Admin role required" });
  }
  next();
}

export function requireWrite(req: AuthedRequest, res: Response, next: NextFunction) {
  if (req.user?.role === "VIEWER") {
    return res.status(403).json({ error: "Read-only role" });
  }
  next();
}
