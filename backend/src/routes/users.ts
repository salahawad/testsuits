import { Router } from "express";
import bcrypt from "bcryptjs";
import multer from "multer";
import { randomUUID } from "crypto";
import { z } from "zod";
import { prisma } from "../db";
import { AuthedRequest, requireManager } from "../middleware/auth";
import { httpError } from "../middleware/error";
import { userListWhere } from "../middleware/scope";
import { logger } from "../lib/logger";
import { putObject, deleteObject, getDownloadUrl } from "../lib/s3";

export const usersRouter = Router();

usersRouter.get("/", async (req: AuthedRequest, res, next) => {
  try {
    const users = await prisma.user.findMany({
      where: userListWhere(req.user!),
      select: { id: true, name: true, email: true, role: true, isLocked: true, createdAt: true },
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
    if (!me) throw httpError(404, "USER_NOT_FOUND");
    res.json({
      id: me.id,
      name: me.name,
      email: me.email,
      role: me.role,
      hasAvatar: !!me.avatarKey,
      company: { id: me.company.id, name: me.company.name, slug: me.company.slug },
    });
  } catch (e) {
    next(e);
  }
});

// --- Self-service profile endpoints -----------------------------------------

const profileSchema = z.object({
  name: z.string().min(1).max(120),
});

usersRouter.patch("/me", async (req: AuthedRequest, res, next) => {
  try {
    const { name } = profileSchema.parse(req.body);
    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: { name },
      select: { id: true, name: true, email: true, role: true },
    });
    logger.info({ userId: user.id }, "profile updated");
    res.json(user);
  } catch (e) {
    next(e);
  }
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z
    .string()
    .min(10, "Password must be at least 10 characters")
    .max(128, "Password must be at most 128 characters"),
});

usersRouter.put("/me/password", async (req: AuthedRequest, res, next) => {
  try {
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) throw httpError(404, "USER_NOT_FOUND");
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) {
      logger.warn({ userId: user.id }, "password change failed: wrong current password");
      throw httpError(400, "INCORRECT_PASSWORD");
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: req.user!.id },
        data: { passwordHash, passwordUpdatedAt: new Date() },
      }),
      prisma.trustedDevice.deleteMany({ where: { userId: req.user!.id } }),
    ]);
    logger.info({ userId: user.id }, "password changed — trusted devices revoked");
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// --- Avatar ----------------------------------------------------------------

const AVATAR_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
});

usersRouter.post("/me/avatar", avatarUpload.single("file"), async (req: AuthedRequest, res, next) => {
  try {
    if (!req.file) throw httpError(400, "NO_FILE_UPLOADED");
    if (!AVATAR_MIME.has(req.file.mimetype)) throw httpError(400, "INVALID_FILE_TYPE");

    const ext = req.file.originalname.split(".").pop() ?? "jpg";
    const storageKey = `avatars/${req.user!.id}/${randomUUID()}.${ext}`;
    await putObject(storageKey, req.file.buffer, req.file.mimetype);

    // Remove old avatar from storage if it exists.
    const prev = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { avatarKey: true } });
    if (prev?.avatarKey) {
      await deleteObject(prev.avatarKey).catch((err) => logger.warn({ err, userId: req.user!.id, key: prev.avatarKey }, "failed to delete old avatar from S3"));
    }

    await prisma.user.update({ where: { id: req.user!.id }, data: { avatarKey: storageKey } });
    logger.info({ userId: req.user!.id, storageKey }, "avatar uploaded");
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

usersRouter.delete("/me/avatar", async (req: AuthedRequest, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { avatarKey: true } });
    if (user?.avatarKey) {
      await deleteObject(user.avatarKey).catch((err) => logger.warn({ err, userId: req.user!.id, key: user.avatarKey }, "failed to delete avatar from S3"));
      await prisma.user.update({ where: { id: req.user!.id }, data: { avatarKey: null } });
      logger.info({ userId: req.user!.id }, "avatar removed");
    }
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

usersRouter.get("/:id/avatar", async (req: AuthedRequest, res, next) => {
  try {
    const target = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { avatarKey: true, companyId: true },
    });
    if (!target || target.companyId !== req.user!.companyId || !target.avatarKey) {
      throw httpError(404, "AVATAR_NOT_FOUND");
    }
    const url = await getDownloadUrl(target.avatarKey);
    res.redirect(url);
  } catch (e) {
    next(e);
  }
});

// --- Manager-only endpoints ------------------------------------------------

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
    if (existing) throw httpError(409, "EMAIL_ALREADY_IN_USE");
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
      throw httpError(404, "USER_NOT_FOUND");
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

usersRouter.patch("/:id/lock", requireManager, async (req: AuthedRequest, res, next) => {
  try {
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target || target.companyId !== req.user!.companyId) {
      throw httpError(404, "USER_NOT_FOUND");
    }
    if (target.id === req.user!.id) throw httpError(400, "CANNOT_LOCK_SELF");
    const lock = z.object({ locked: z.boolean() }).parse(req.body);
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { isLocked: lock.locked },
      select: { id: true, name: true, email: true, role: true, isLocked: true, createdAt: true },
    });
    logger.info(
      { actorId: req.user!.id, userId: user.id, locked: lock.locked, companyId: req.user!.companyId },
      lock.locked ? "user locked" : "user unlocked",
    );
    res.json(user);
  } catch (e) {
    next(e);
  }
});

usersRouter.delete("/:id", requireManager, async (req: AuthedRequest, res, next) => {
  try {
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target || target.companyId !== req.user!.companyId) {
      throw httpError(404, "USER_NOT_FOUND");
    }
    if (target.id === req.user!.id) throw httpError(400, "CANNOT_DELETE_SELF");
    await prisma.user.delete({ where: { id: req.params.id } });
    logger.info({ deletedBy: req.user!.id, userId: req.params.id }, "user deleted");
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});
