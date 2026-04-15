import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../db";
import { signToken } from "../middleware/auth";
import { httpError } from "../middleware/error";
import { logger } from "../lib/logger";

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post("/login", async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email }, include: { company: true } });
    if (!user) {
      logger.warn({ email, reason: "user_not_found" }, "login failed");
      throw httpError(401, "Invalid credentials");
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      logger.warn({ email, userId: user.id, reason: "bad_password" }, "login failed");
      throw httpError(401, "Invalid credentials");
    }
    const token = signToken({
      id: user.id,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
    });
    logger.info({ userId: user.id, email: user.email, companyId: user.companyId }, "login succeeded");
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        company: { id: user.company.id, name: user.company.name, slug: user.company.slug },
      },
    });
  } catch (e) {
    next(e);
  }
});

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1),
  companyName: z.string().min(1),
});

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "company";
}

// Public signup: creates a new Company and makes the signer its first MANAGER.
// There is no super-admin — every account lives inside exactly one company.
authRouter.post("/signup", async (req, res, next) => {
  try {
    const { email, password, name, companyName } = signupSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw httpError(409, "Email already in use");

    const baseSlug = slugify(companyName);
    let slug = baseSlug;
    let n = 2;
    while (await prisma.company.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${n++}`;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const { user, company } = await prisma.$transaction(async (tx) => {
      const company = await tx.company.create({ data: { name: companyName, slug } });
      const user = await tx.user.create({
        data: {
          email,
          name,
          passwordHash,
          role: "MANAGER",
          companyId: company.id,
        },
      });
      return { user, company };
    });

    const token = signToken({
      id: user.id,
      email: user.email,
      role: user.role,
      companyId: company.id,
    });
    logger.info({ userId: user.id, companyId: company.id, slug: company.slug }, "company signup");
    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        company: { id: company.id, name: company.name, slug: company.slug },
      },
    });
  } catch (e) {
    next(e);
  }
});
