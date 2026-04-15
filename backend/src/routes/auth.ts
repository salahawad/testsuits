import { Router } from "express";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import { randomBytes, createHash } from "crypto";
import { z } from "zod";
import { prisma } from "../db";
import { AuthedRequest, requireAuth, requireManager, signToken } from "../middleware/auth";
import { httpError } from "../middleware/error";
import { logger } from "../lib/logger";
import { appUrl, sendEmail } from "../lib/mailer";

const RESET_TTL_MS = 60 * 60 * 1000;           // 1 hour
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Stable bcrypt hash used as a timing shield when login can't find the user.
// Generated once at boot for "invalid-password-but-valid-shape" so attackers
// can't infer user existence from response latency.
const TIMING_SHIELD_HASH = bcrypt.hashSync(randomBytes(16).toString("hex"), 10);

function hashToken(plaintext: string) {
  return createHash("sha256").update(plaintext).digest("hex");
}
function newRawToken() {
  return randomBytes(24).toString("base64url");
}

// Rate limits. Tight on credential-adjacent endpoints; a bit looser on read-only
// invite preview. Limits are per-IP and per-window; the reverse proxy must set
// X-Forwarded-For (see TRUST_PROXY in app.ts) for this to work at the edge.
const limiterCommon = {
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." },
};
const loginLimiter = rateLimit({ windowMs: 60_000, max: 10, ...limiterCommon });
const signupLimiter = rateLimit({ windowMs: 60 * 60_000, max: 5, ...limiterCommon });
const forgotLimiter = rateLimit({ windowMs: 60 * 60_000, max: 5, ...limiterCommon });
const resetLimiter = rateLimit({ windowMs: 60_000, max: 10, ...limiterCommon });
const inviteLimiter = rateLimit({ windowMs: 60 * 60_000, max: 30, ...limiterCommon });
const invitePreviewLimiter = rateLimit({ windowMs: 60_000, max: 30, ...limiterCommon });
const acceptInviteLimiter = rateLimit({ windowMs: 60_000, max: 10, ...limiterCommon });

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// Password policy applied when a password is *set* (signup, reset, accept-invite).
// Login deliberately doesn't re-check strength — existing short passwords from
// pre-policy users should still be usable until they next reset.
const COMMON_PASSWORDS = new Set<string>([
  "password", "password1", "password123", "p@ssw0rd", "passw0rd",
  "123456", "1234567", "12345678", "123456789", "1234567890",
  "qwerty", "qwertyui", "qwertyuiop", "asdfgh", "asdfghjkl",
  "abc123", "abcd1234", "iloveyou", "letmein", "welcome",
  "admin", "admin123", "administrator", "root", "root1234",
  "monkey", "dragon", "football", "baseball", "sunshine",
  "changeme", "default", "temp1234", "hello123", "testtest",
]);

const passwordPolicy = z
  .string()
  .min(10, "Password must be at least 10 characters")
  .max(128, "Password must be at most 128 characters")
  .refine((p) => !COMMON_PASSWORDS.has(p.toLowerCase()), "That password is too common. Pick a less obvious one.");

authRouter.post("/login", loginLimiter, async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email }, include: { company: true } });
    // Run bcrypt.compare unconditionally so response latency doesn't reveal
    // whether the email exists.
    const ok = await bcrypt.compare(password, user?.passwordHash ?? TIMING_SHIELD_HASH);
    if (!user) {
      logger.warn({ email, reason: "user_not_found" }, "login failed");
      throw httpError(401, "Invalid credentials");
    }
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
  password: passwordPolicy,
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
authRouter.post("/signup", signupLimiter, async (req, res, next) => {
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

// --- Password reset --------------------------------------------------------

const forgotSchema = z.object({ email: z.string().email() });

authRouter.post("/forgot", forgotLimiter, async (req, res, next) => {
  try {
    const { email } = forgotSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    // Do NOT disclose whether the email exists. Only create a token if it does;
    // the response is always the same shape from the caller's perspective.
    let devToken: string | undefined;
    if (user) {
      const raw = newRawToken();
      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(raw),
          expiresAt: new Date(Date.now() + RESET_TTL_MS),
        },
      });
      devToken = raw;
      const resetLink = `${appUrl}/reset/${raw}`;
      // Never log the raw token — logs are often shipped to third-party aggregators.
      logger.info({ userId: user.id }, "password reset issued");
      await sendEmail({
        to: user.email,
        subject: "Reset your TestSuits password",
        text: `Hi ${user.name},\n\nWe received a request to reset your TestSuits password. The link below is valid for 1 hour:\n\n${resetLink}\n\nIf you didn't request this, you can ignore this email.\n`,
        html: `<p>Hi ${user.name},</p><p>We received a request to reset your TestSuits password. The link below is valid for 1 hour:</p><p><a href="${resetLink}">${resetLink}</a></p><p>If you didn't request this, you can ignore this email.</p>`,
      });
    } else {
      logger.info({ email }, "password reset requested for unknown email (silent)");
    }
    // The raw token is returned only in non-production so the UI can surface
    // the link without email. In production the email is the sole delivery.
    const leak = process.env.NODE_ENV !== "production" ? { devToken } : {};
    res.json({ ok: true, ...leak });
  } catch (e) {
    next(e);
  }
});

const resetSchema = z.object({
  token: z.string().min(10),
  password: passwordPolicy,
});

authRouter.post("/reset", resetLimiter, async (req, res, next) => {
  try {
    const { token, password } = resetSchema.parse(req.body);
    const row = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!row || row.consumedAt || row.expiresAt < new Date()) {
      throw httpError(400, "Reset link is invalid or expired");
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const now = new Date();
    await prisma.$transaction([
      // passwordUpdatedAt invalidates any outstanding JWT for this user (see
      // requireAuth). Deleting ApiTokens invalidates CI/script credentials
      // that may have been leaked alongside the password.
      prisma.user.update({
        where: { id: row.userId },
        data: { passwordHash, passwordUpdatedAt: now },
      }),
      prisma.apiToken.deleteMany({ where: { userId: row.userId } }),
      prisma.passwordResetToken.update({ where: { id: row.id }, data: { consumedAt: now } }),
      // Any other outstanding reset tokens for this user become unusable.
      prisma.passwordResetToken.updateMany({
        where: { userId: row.userId, consumedAt: null, id: { not: row.id } },
        data: { consumedAt: now },
      }),
    ]);
    logger.info({ userId: row.userId }, "password reset consumed; JWT + API tokens revoked");
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// --- Team invite -----------------------------------------------------------

const inviteSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(120),
  role: z.enum(["ADMIN", "MANAGER", "TESTER", "VIEWER"]),
});

authRouter.post("/invite", inviteLimiter, requireAuth, requireManager, async (req: AuthedRequest, res, next) => {
  try {
    const { email, name, role } = inviteSchema.parse(req.body);
    // Refuse if this email is already a user in ANY company — email is a global unique in User.
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) throw httpError(409, "A user with that email already exists");

    // Invalidate previous un-consumed invites for the same email within this company.
    await prisma.inviteToken.deleteMany({
      where: { companyId: req.user!.companyId, email, acceptedAt: null },
    });

    const raw = newRawToken();
    const invite = await prisma.inviteToken.create({
      data: {
        companyId: req.user!.companyId,
        email,
        name,
        role,
        tokenHash: hashToken(raw),
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
        invitedById: req.user!.id,
      },
      select: { id: true, email: true, name: true, role: true, expiresAt: true },
    });
    const inviteLink = `${appUrl}/invite/${raw}`;
    // Never log the raw token — logs are often shipped to third-party aggregators.
    logger.info({ inviteId: invite.id, email }, "invite issued");
    await sendEmail({
      to: email,
      subject: `You've been invited to join TestSuits`,
      text: `Hi ${name},\n\n${req.user!.email} invited you to join their TestSuits workspace as a ${role}. Accept the invite here (valid for 7 days):\n\n${inviteLink}\n`,
      html: `<p>Hi ${name},</p><p>${req.user!.email} invited you to join their TestSuits workspace as a <strong>${role}</strong>. Accept the invite here (valid for 7 days):</p><p><a href="${inviteLink}">${inviteLink}</a></p>`,
    });
    const leak = process.env.NODE_ENV !== "production" ? { devToken: raw } : {};
    res.status(201).json({ ...invite, ...leak });
  } catch (e) {
    next(e);
  }
});

authRouter.get("/invite/:token", invitePreviewLimiter, async (req, res, next) => {
  try {
    const row = await prisma.inviteToken.findUnique({
      where: { tokenHash: hashToken(req.params.token) },
      include: { company: true },
    });
    if (!row || row.acceptedAt || row.expiresAt < new Date()) {
      throw httpError(404, "Invite is invalid or expired");
    }
    res.json({
      email: row.email,
      name: row.name,
      role: row.role,
      company: { id: row.company.id, name: row.company.name, slug: row.company.slug },
    });
  } catch (e) {
    next(e);
  }
});

const acceptSchema = z.object({
  token: z.string().min(10),
  password: passwordPolicy,
});

authRouter.post("/accept-invite", acceptInviteLimiter, async (req, res, next) => {
  try {
    const { token, password } = acceptSchema.parse(req.body);
    const row = await prisma.inviteToken.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { company: true },
    });
    if (!row || row.acceptedAt || row.expiresAt < new Date()) {
      throw httpError(400, "Invite is invalid or expired");
    }
    // Race-safety: someone may have signed up with this email in the meantime.
    const existingUser = await prisma.user.findUnique({ where: { email: row.email } });
    if (existingUser) throw httpError(409, "A user with that email already exists");

    const passwordHash = await bcrypt.hash(password, 10);
    const { user } = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: row.email,
          name: row.name,
          passwordHash,
          role: row.role,
          companyId: row.companyId,
        },
      });
      await tx.inviteToken.update({ where: { id: row.id }, data: { acceptedAt: new Date() } });
      return { user };
    });

    const jwt = signToken({ id: user.id, email: user.email, role: user.role, companyId: user.companyId });
    logger.info({ userId: user.id, companyId: user.companyId, inviteId: row.id }, "invite accepted");
    res.status(201).json({
      token: jwt,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        company: { id: row.company.id, name: row.company.name, slug: row.company.slug },
      },
    });
  } catch (e) {
    next(e);
  }
});
