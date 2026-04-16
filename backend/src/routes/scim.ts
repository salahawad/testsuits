import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { randomBytes, createHash } from "crypto";
import { prisma } from "../db";
import { AuthedRequest, requireAdmin } from "../middleware/auth";
import { httpError } from "../middleware/error";
import { logger } from "../lib/logger";

export const scimTokensRouter = Router();
export const scimRouter = Router();

// --- Token management (ADMIN only, mounted under /api/scim-tokens) --------

const SCIM_PREFIX = "scim_";
const hash = (raw: string) => createHash("sha256").update(raw).digest("hex");

scimTokensRouter.get("/", requireAdmin, async (req: AuthedRequest, res, next) => {
  try {
    const rows = await prisma.scimToken.findMany({
      where: { companyId: req.user!.companyId },
      select: { id: true, name: true, lastUsedAt: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    res.json(rows);
  } catch (e) { next(e); }
});

scimTokensRouter.post("/", requireAdmin, async (req: AuthedRequest, res, next) => {
  try {
    const { name } = z.object({ name: z.string().min(1).max(120) }).parse(req.body);
    const raw = SCIM_PREFIX + randomBytes(24).toString("base64url");
    const row = await prisma.scimToken.create({
      data: { companyId: req.user!.companyId, name, tokenHash: hash(raw) },
      select: { id: true, name: true, createdAt: true },
    });
    res.status(201).json({ ...row, token: raw });
  } catch (e) { next(e); }
});

scimTokensRouter.delete("/:id", requireAdmin, async (req: AuthedRequest, res, next) => {
  try {
    await prisma.scimToken.deleteMany({ where: { id: req.params.id, companyId: req.user!.companyId } });
    res.status(204).end();
  } catch (e) { next(e); }
});

// --- SCIM 2.0 endpoints (public, Bearer-token authenticated) --------------
//
// Implements the minimum useful surface so an IdP (Okta, Azure AD) can
// provision users. Groups are not yet implemented — add when a customer asks.
// Reference: RFC 7644.

async function scimAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) throw httpError(401, "Missing Bearer token");
    const token = header.slice(7);
    if (!token.startsWith(SCIM_PREFIX)) throw httpError(401, "Invalid token prefix");
    const row = await prisma.scimToken.findUnique({ where: { tokenHash: hash(token) } });
    if (!row) throw httpError(401, "Invalid SCIM token");
    prisma.scimToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
    (req as any).scimCompanyId = row.companyId;
    next();
  } catch (e) { next(e); }
}

scimRouter.use(scimAuth);

function toScimUser(u: { id: string; email: string; name: string; role: string; createdAt: Date }) {
  return {
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
    id: u.id,
    userName: u.email,
    name: { formatted: u.name },
    emails: [{ value: u.email, primary: true }],
    active: true,
    meta: { resourceType: "User", created: u.createdAt, location: `/api/scim/v2/Users/${u.id}` },
    "urn:ietf:params:scim:schemas:extension:testsuits:2.0:User": { role: u.role },
  };
}

scimRouter.get("/v2/Users", async (req, res, next) => {
  try {
    const companyId: string = (req as any).scimCompanyId;
    const filter = typeof req.query.filter === "string" ? req.query.filter : "";
    const emailMatch = /userName\s+eq\s+"([^"]+)"/i.exec(filter);
    const where: any = { companyId };
    if (emailMatch) where.email = emailMatch[1];
    const users = await prisma.user.findMany({ where, orderBy: { createdAt: "asc" }, take: 200 });
    res.json({
      schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
      totalResults: users.length,
      Resources: users.map(toScimUser),
    });
  } catch (e) { next(e); }
});

scimRouter.get("/v2/Users/:id", async (req, res, next) => {
  try {
    const companyId: string = (req as any).scimCompanyId;
    const user = await prisma.user.findFirst({ where: { id: req.params.id, companyId } });
    if (!user) throw httpError(404, "User not found");
    res.json(toScimUser(user));
  } catch (e) { next(e); }
});

const createSchema = z.object({
  userName: z.string().email(),
  name: z.object({ formatted: z.string().optional(), givenName: z.string().optional(), familyName: z.string().optional() }).optional(),
  emails: z.array(z.object({ value: z.string().email(), primary: z.boolean().optional() })).optional(),
  active: z.boolean().optional(),
  "urn:ietf:params:scim:schemas:extension:testsuits:2.0:User": z.object({ role: z.enum(["ADMIN", "MANAGER", "TESTER", "VIEWER"]).optional() }).optional(),
});

scimRouter.post("/v2/Users", async (req, res, next) => {
  try {
    const companyId: string = (req as any).scimCompanyId;
    const body = createSchema.parse(req.body);
    const email = body.emails?.[0]?.value ?? body.userName;
    const name = body.name?.formatted ?? [body.name?.givenName, body.name?.familyName].filter(Boolean).join(" ") ?? email;
    const role = body["urn:ietf:params:scim:schemas:extension:testsuits:2.0:User"]?.role ?? "TESTER";
    const user = await prisma.user.create({
      data: { email, name, companyId, role, passwordHash: "scim-provisioned", emailVerifiedAt: new Date() },
    });
    logger.info({ userId: user.id, companyId, via: "scim" }, "user provisioned");
    res.status(201).json(toScimUser(user));
  } catch (e) { next(e); }
});

scimRouter.patch("/v2/Users/:id", async (req, res, next) => {
  try {
    const companyId: string = (req as any).scimCompanyId;
    const existing = await prisma.user.findFirst({ where: { id: req.params.id, companyId } });
    if (!existing) throw httpError(404, "User not found");
    // Minimal PatchOp support: `{Operations:[{op:"replace", path, value}]}`.
    const ops = (req.body?.Operations ?? []) as Array<{ op: string; path?: string; value: any }>;
    const data: any = {};
    for (const op of ops) {
      if (op.op.toLowerCase() === "replace") {
        if (op.path === "active" && op.value === false) {
          // Soft-deactivate by flipping role to VIEWER; hard-delete via DELETE.
          data.role = "VIEWER";
        } else if (op.path === "name.formatted") data.name = op.value;
        else if (op.path === "userName" || op.path === "emails[type eq \"work\"].value") data.email = op.value;
      }
    }
    const user = await prisma.user.update({ where: { id: existing.id }, data });
    res.json(toScimUser(user));
  } catch (e) { next(e); }
});

scimRouter.delete("/v2/Users/:id", async (req, res, next) => {
  try {
    const companyId: string = (req as any).scimCompanyId;
    const existing = await prisma.user.findFirst({ where: { id: req.params.id, companyId } });
    if (!existing) throw httpError(404, "User not found");
    await prisma.user.delete({ where: { id: existing.id } });
    logger.info({ userId: existing.id, companyId, via: "scim" }, "user deprovisioned");
    res.status(204).end();
  } catch (e) { next(e); }
});
