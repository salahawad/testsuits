import { Router } from "express";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { generateSecret, generateURI, verifySync } from "otplib";
import QRCode from "qrcode";
import { prisma } from "../db";
import { AuthedRequest, signToken, verifyChallengeToken } from "../middleware/auth";
import { httpError } from "../middleware/error";
import { logger } from "../lib/logger";

const limiterCommon = {
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." },
};
const setupLimiter = rateLimit({ windowMs: 60_000, max: 10, ...limiterCommon });
const authLimiter = rateLimit({ windowMs: 60_000, max: 10, ...limiterCommon });

export const twoFactorRouter = Router();

// --- Status (GET /2fa/status) ----------------------------------------------

twoFactorRouter.get("/status", async (req: AuthedRequest, res, next) => {
  try {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: req.user!.id },
      select: { totpEnabledAt: true },
    });
    res.json({ enabled: !!user.totpEnabledAt, enabledAt: user.totpEnabledAt });
  } catch (e) { next(e); }
});

// --- Setup (POST /2fa/setup) -----------------------------------------------
// Generates a new TOTP secret and returns the otpauth URI + QR code data URL.
// The secret is NOT persisted until /confirm-setup succeeds.

twoFactorRouter.post("/setup", setupLimiter, async (req: AuthedRequest, res, next) => {
  try {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: req.user!.id },
      select: { totpEnabledAt: true, email: true },
    });
    if (user.totpEnabledAt) throw httpError(409, "2FA is already enabled");

    const secret = generateSecret();
    const otpauthUri = generateURI({ issuer: "TestSuits", label: user.email, secret });
    const qrDataUrl = await QRCode.toDataURL(otpauthUri);

    // Store the secret temporarily so confirm-setup can verify a code against it.
    // totpEnabledAt stays null until confirmation succeeds.
    await prisma.user.update({
      where: { id: req.user!.id },
      data: { totpSecret: secret },
    });

    logger.info({ userId: req.user!.id }, "2fa setup initiated");
    res.json({ secret, otpauthUri, qrDataUrl });
  } catch (e) { next(e); }
});

// --- Confirm setup (POST /2fa/confirm-setup) --------------------------------
// Verifies a TOTP code against the pending secret and enables 2FA.

const confirmSchema = z.object({ code: z.string().length(6) });

twoFactorRouter.post("/confirm-setup", setupLimiter, async (req: AuthedRequest, res, next) => {
  try {
    const { code } = confirmSchema.parse(req.body);
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: req.user!.id },
      select: { totpSecret: true, totpEnabledAt: true },
    });
    if (user.totpEnabledAt) throw httpError(409, "2FA is already enabled");
    if (!user.totpSecret) throw httpError(400, "No 2FA setup in progress — call /2fa/setup first");

    const valid = verifySync({ secret: user.totpSecret, token: code }).valid;
    if (!valid) throw httpError(400, "Invalid code — please try again");

    await prisma.user.update({
      where: { id: req.user!.id },
      data: { totpEnabledAt: new Date() },
    });

    logger.info({ userId: req.user!.id }, "2fa enabled");
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// --- Disable (POST /2fa/disable) -------------------------------------------
// Requires current password for safety.

const disableSchema = z.object({ password: z.string().min(1) });

twoFactorRouter.post("/disable", setupLimiter, async (req: AuthedRequest, res, next) => {
  try {
    const { password } = disableSchema.parse(req.body);
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: req.user!.id },
      select: { passwordHash: true, totpEnabledAt: true },
    });
    if (!user.totpEnabledAt) throw httpError(400, "2FA is not enabled");

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw httpError(401, "Incorrect password");

    await prisma.user.update({
      where: { id: req.user!.id },
      data: { totpSecret: null, totpEnabledAt: null },
    });

    logger.info({ userId: req.user!.id }, "2fa disabled");
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// --- Authenticate (POST /2fa/authenticate) ---------------------------------
// Public endpoint. Consumes a challenge token + TOTP code and returns a
// full session JWT. Called from the login flow when 2FA is required.

const authenticateSchema = z.object({
  challengeToken: z.string().min(1),
  code: z.string().length(6),
});

twoFactorRouter.post("/authenticate", authLimiter, async (req, res, next) => {
  try {
    const { challengeToken, code } = authenticateSchema.parse(req.body);

    let userId: string;
    try {
      userId = verifyChallengeToken(challengeToken);
    } catch {
      throw httpError(401, "Challenge token is invalid or expired — please sign in again");
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { company: true },
    });
    if (!user || !user.totpEnabledAt || !user.totpSecret) {
      throw httpError(400, "2FA is not enabled for this account");
    }

    const valid = verifySync({ secret: user.totpSecret, token: code }).valid;
    if (!valid) throw httpError(401, "Invalid 2FA code");

    const token = signToken({
      id: user.id,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
    });
    logger.info({ userId: user.id }, "2fa authentication succeeded");
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
  } catch (e) { next(e); }
});
