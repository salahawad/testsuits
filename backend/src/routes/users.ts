import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../db";
import { AuthedRequest, requireManager } from "../middleware/auth";
import { httpError } from "../middleware/error";
import { userListWhere } from "../middleware/scope";
import { logger } from "../lib/logger";

export const usersRouter = Router();

usersRouter.get("/", async (req: AuthedRequest, res, next) => {
  try {
    const users = await prisma.user.findMany({
      where: userListWhere(req.user!),
      select: { id: true, name: true, email: true, role: true, createdAt: true },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    });
    res.json(users);
  } catch (e) {
    next(e);
  }
});

usersRouter.get("/me", async (req: AuthedRequest, res, next) => {
  try {
    const me = await prisma.user.findUnique({
      where: { id: req.user!.id },
      include: { company: true },
    });
    if (!me) throw httpError(404, "User not found");
    res.json({
      id: me.id,
      name: me.name,
      email: me.email,
      role: me.role,
      company: { id: me.company.id, name: me.company.name, slug: me.company.slug },
    });
  } catch (e) {
    next(e);
  }
});

const createSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(6),
  role: z.enum(["MANAGER", "TESTER"]),
});

// Managers create users directly inside their own company — no invite flow.
usersRouter.post("/", requireManager, async (req: AuthedRequest, res, next) => {
  try {
    const data = createSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) throw httpError(409, "Email already in use");
    const user = await prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        passwordHash: await bcrypt.hash(data.password, 10),
        role: data.role,
        companyId: req.user!.companyId,
      },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });
    logger.info(
      { createdBy: req.user!.id, newUserId: user.id, role: user.role, companyId: req.user!.companyId },
      "user created",
    );
    res.status(201).json(user);
  } catch (e) {
    next(e);
  }
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(["MANAGER", "TESTER"]).optional(),
  password: z.string().min(6).optional(),
});

usersRouter.patch("/:id", requireManager, async (req: AuthedRequest, res, next) => {
  try {
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target || target.companyId !== req.user!.companyId) {
      throw httpError(404, "User not found");
    }
    const data = updateSchema.parse(req.body);
    const update: Record<string, unknown> = {};
    if (data.name) update.name = data.name;
    if (data.role) update.role = data.role;
    if (data.password) update.passwordHash = await bcrypt.hash(data.password, 10);
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: update,
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });
    logger.info({ updatedBy: req.user!.id, userId: user.id, fields: Object.keys(update) }, "user updated");
    res.json(user);
  } catch (e) {
    next(e);
  }
});

usersRouter.delete("/:id", requireManager, async (req: AuthedRequest, res, next) => {
  try {
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target || target.companyId !== req.user!.companyId) {
      throw httpError(404, "User not found");
    }
    if (target.id === req.user!.id) throw httpError(400, "Cannot delete yourself");
    await prisma.user.delete({ where: { id: req.params.id } });
    logger.info({ deletedBy: req.user!.id, userId: req.params.id }, "user deleted");
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});
