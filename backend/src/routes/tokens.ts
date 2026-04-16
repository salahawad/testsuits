import { Router } from "express";
import { z } from "zod";
import { randomBytes } from "crypto";
import { prisma } from "../db";
import { AuthedRequest, API_TOKEN_PREFIX, hashApiToken } from "../middleware/auth";
import { httpError } from "../middleware/error";
import { logger } from "../lib/logger";

export const tokensRouter = Router();

const createSchema = z.object({ name: z.string().min(1).max(120) });

function generatePlaintext() {
  return API_TOKEN_PREFIX + randomBytes(24).toString("base64url");
}

tokensRouter.get("/", async (req: AuthedRequest, res, next) => {
  try {
    // API-token callers can't manage tokens — that'd let a compromised token
    // mint more tokens. Restrict token management to interactive (JWT) sessions.
    if (req.authSource !== "jwt") throw httpError(403, "INTERACTIVE_SESSION_REQUIRED");
    const tokens = await prisma.apiToken.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, createdAt: true, lastUsedAt: true },
    });
    res.json(tokens);
  } catch (e) {
    next(e);
  }
});

tokensRouter.post("/", async (req: AuthedRequest, res, next) => {
  try {
    if (req.authSource !== "jwt") throw httpError(403, "INTERACTIVE_SESSION_REQUIRED");
    const { name } = createSchema.parse(req.body);
    const plaintext = generatePlaintext();
    const token = await prisma.apiToken.create({
      data: {
        userId: req.user!.id,
        name,
        tokenHash: hashApiToken(plaintext),
      },
      select: { id: true, name: true, createdAt: true, lastUsedAt: true },
    });
    logger.info({ tokenId: token.id, userId: req.user!.id }, "api token created");
    // Plaintext is returned exactly once; the server no longer has a reversible copy.
    res.status(201).json({ ...token, plaintext });
  } catch (e) {
    next(e);
  }
});

tokensRouter.delete("/:id", async (req: AuthedRequest, res, next) => {
  try {
    if (req.authSource !== "jwt") throw httpError(403, "INTERACTIVE_SESSION_REQUIRED");
    const row = await prisma.apiToken.findUnique({ where: { id: req.params.id } });
    if (!row || row.userId !== req.user!.id) throw httpError(404, "TOKEN_NOT_FOUND");
    await prisma.apiToken.delete({ where: { id: row.id } });
    logger.info({ tokenId: row.id, userId: req.user!.id }, "api token revoked");
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});
