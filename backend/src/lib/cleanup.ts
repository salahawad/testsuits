import { prisma } from "../db";
import { logger } from "./logger";

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

/**
 * Delete reset/invite tokens that are either consumed/accepted OR expired.
 * Idempotent; safe to run concurrently (Prisma deleteMany is atomic per row).
 */
export async function sweepExpiredAuthTokens() {
  const now = new Date();
  try {
    const [resets, invites] = await Promise.all([
      prisma.passwordResetToken.deleteMany({
        where: { OR: [{ expiresAt: { lt: now } }, { consumedAt: { not: null } }] },
      }),
      prisma.inviteToken.deleteMany({
        where: { OR: [{ expiresAt: { lt: now } }, { acceptedAt: { not: null } }] },
      }),
    ]);
    if (resets.count || invites.count) {
      logger.info({ resets: resets.count, invites: invites.count }, "auth token sweep");
    }
  } catch (err) {
    logger.warn({ err }, "auth token sweep failed; will retry on next tick");
  }
}

export function startAuthTokenSweep() {
  // Run once at boot (after a small delay so the app is ready) and then every
  // six hours. setInterval is fine for a single-process deploy; in a scaled
  // deploy you'd move this to a cron runner or a single leader.
  setTimeout(sweepExpiredAuthTokens, 30_000);
  const handle = setInterval(sweepExpiredAuthTokens, SIX_HOURS_MS);
  // Don't keep the event loop alive just for the sweep — let the server exit
  // cleanly when asked to.
  handle.unref?.();
  return handle;
}
