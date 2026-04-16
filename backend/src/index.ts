import { app } from "./app";
import { logger } from "./lib/logger";
import { startAuthTokenSweep } from "./lib/cleanup";
import { prisma } from "./db";

const port = Number(process.env.PORT ?? 4000);
const SHUTDOWN_TIMEOUT_MS = Number(process.env.SHUTDOWN_TIMEOUT_MS ?? 15_000);

const server = app.listen(port, () => {
  logger.info({ port }, "API listening");
  startAuthTokenSweep();
});

// ---------------------------------------------------------------------------
// Graceful shutdown (K8s sends SIGTERM before killing the pod)
// ---------------------------------------------------------------------------
let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "shutdown signal received, draining connections");

  // Stop accepting new connections; let in-flight requests finish.
  server.close(async () => {
    logger.info("HTTP server closed");
    try {
      await prisma.$disconnect();
      logger.info("database connection closed");
    } catch (err) {
      logger.error({ err }, "error disconnecting from database");
    }
    process.exit(0);
  });

  // Force-kill if draining takes too long (K8s terminationGracePeriodSeconds
  // defaults to 30 s — we use a shorter timeout so pino has time to flush).
  setTimeout(() => {
    logger.error("graceful shutdown timed out, forcing exit");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "unhandledRejection");
});

process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "uncaughtException");
  process.exit(1);
});
