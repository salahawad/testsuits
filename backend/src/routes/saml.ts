import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { AuthedRequest, requireAdmin, signToken } from "../middleware/auth";
import { httpError } from "../middleware/error";
import { logger } from "../lib/logger";

export const samlRouter = Router();

// --- Per-company SAML config (ADMIN only) ---------------------------------

const configSchema = z.object({
  entityId: z.string().min(1),
  ssoUrl: z.string().url(),
  x509Cert: z.string().min(1),
  emailAttribute: z.string().default("email"),
  nameAttribute: z.string().default("name"),
  defaultRole: z.enum(["ADMIN", "MANAGER", "TESTER", "VIEWER"]).default("TESTER"),
  enabled: z.boolean().default(false),
});

samlRouter.get("/config", requireAdmin, async (req: AuthedRequest, res, next) => {
  try {
    const cfg = await prisma.samlConfig.findUnique({
      where: { companyId: req.user!.companyId },
      select: { entityId: true, ssoUrl: true, emailAttribute: true, nameAttribute: true, defaultRole: true, enabled: true, updatedAt: true },
    });
    res.json(cfg);
  } catch (e) { next(e); }
});

samlRouter.put("/config", requireAdmin, async (req: AuthedRequest, res, next) => {
  try {
    const data = configSchema.parse(req.body);
    const cfg = await prisma.samlConfig.upsert({
      where: { companyId: req.user!.companyId },
      update: data,
      create: { ...data, companyId: req.user!.companyId },
    });
    logger.info({ companyId: cfg.companyId, enabled: cfg.enabled }, "saml config updated");
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// --- SP-initiated SSO (public, keyed by company slug) ---------------------
//
// SCAFFOLD ONLY — to go to production:
//   1) Install `passport-saml` (or `@node-saml/node-saml`)
//   2) In /login, build an AuthnRequest against cfg.ssoUrl and redirect the
//      browser. Store the relay state in a short-lived signed cookie.
//   3) In /acs, verify the SAMLResponse against cfg.x509Cert, pull the email
//      + name from the attributes named by cfg.emailAttribute/nameAttribute,
//      upsert the User with cfg.defaultRole (if new), sign our JWT, and
//      redirect to APP_URL/auth/saml/complete?token=<jwt>.
//
// The routes below return 501 so the frontend can detect they exist without
// mis-interpreting the contract.

samlRouter.get("/:slug/login", async (req, res, next) => {
  try {
    const company = await prisma.company.findUnique({ where: { slug: req.params.slug } });
    if (!company) throw httpError(404, "COMPANY_NOT_FOUND");
    const cfg = await prisma.samlConfig.findUnique({ where: { companyId: company.id } });
    if (!cfg?.enabled) throw httpError(404, "SSO_NOT_ENABLED");
    // TODO: build and redirect to AuthnRequest.
    res.status(501).json({
      error: "SAML_NOT_IMPLEMENTED",
      hint: "Install passport-saml and wire this handler — see routes/saml.ts comments",
      ssoUrl: cfg.ssoUrl,
    });
  } catch (e) { next(e); }
});

samlRouter.post("/:slug/acs", async (req, res, next) => {
  try {
    const company = await prisma.company.findUnique({ where: { slug: req.params.slug } });
    if (!company) throw httpError(404, "COMPANY_NOT_FOUND");
    const cfg = await prisma.samlConfig.findUnique({ where: { companyId: company.id } });
    if (!cfg?.enabled) throw httpError(404, "SSO_NOT_ENABLED");

    // DO NOT accept a pre-validated `{email, name}` body here. In production
    // that's an account-takeover primitive — anyone who knows a company slug
    // could POST the email of any existing user and receive a JWT for them.
    // The only safe behavior until a real assertion parser is wired up is to
    // reject the request.
    //
    // To finish SSO:
    //   1) Install `@node-saml/node-saml`.
    //   2) Parse the `SAMLResponse` form field and verify its signature
    //      against cfg.x509Cert.
    //   3) Pull attributes by cfg.emailAttribute / cfg.nameAttribute.
    //   4) Upsert the User with cfg.defaultRole and sign a JWT.
    //
    // Only enable the unsafe stub below when explicitly asked for by an
    // environment that is not production.
    const allowStub = process.env.SAML_ACS_UNSAFE_STUB === "1" && process.env.NODE_ENV !== "production";
    if (!allowStub) {
      logger.warn({ slug: req.params.slug, companyId: company.id }, "saml acs hit without validator — rejecting");
      return res.status(501).json({
        error: "SAML_NOT_IMPLEMENTED",
        hint: "Wire @node-saml/node-saml into routes/saml.ts. Do not deploy this endpoint to production until then.",
      });
    }

    logger.warn({ slug: req.params.slug }, "saml acs using UNSAFE stub — development only");
    const body = z.object({ email: z.string().email(), name: z.string().min(1) }).parse(req.body);
    const user = await prisma.user.upsert({
      where: { email: body.email },
      update: {},
      create: {
        email: body.email,
        name: body.name,
        passwordHash: "saml-only",
        role: cfg.defaultRole,
        companyId: company.id,
        emailVerifiedAt: new Date(), // SSO-authenticated users are verified by the IdP.
      },
    });
    const token = signToken({ id: user.id, email: user.email, role: user.role, companyId: user.companyId });
    logger.info({ userId: user.id, via: "saml-stub" }, "sso login (stub)");
    res.json({ token });
  } catch (e) { next(e); }
});
