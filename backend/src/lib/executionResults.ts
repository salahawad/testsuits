import { ExecStatus, Prisma } from "@prisma/client";
import { prisma } from "../db";
import { logger } from "./logger";

export type Combo = {
  platform: string | null;
  connectivity: string | null;
  locale: string;
};

/**
 * Normalize a run's locale selection into a list of codes. The primary source
 * is the multi-select `locales` array; the legacy comma-separated `locale`
 * string is parsed as a fallback so runs created before the array existed
 * continue to expand correctly. Empty input returns a single empty-string
 * sentinel so every execution still gets at least one result row per
 * platform × connectivity pairing.
 */
export function parseLocales(
  locales: string[] | null | undefined,
  legacyLocale?: string | null,
): string[] {
  if (locales && locales.length) {
    const cleaned = locales.map((s) => s.trim()).filter(Boolean);
    if (cleaned.length) return cleaned;
  }
  if (legacyLocale) {
    const parts = legacyLocale.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length) return parts;
  }
  return [""];
}

/**
 * Expand a run's (platforms × connectivities × locales) arrays into discrete
 * result combinations. Empty arrays collapse to a single null so a run with
 * no platforms still produces one result per connectivity × locale.
 */
export function buildCombos(
  platforms: string[] | undefined | null,
  connectivities: string[] | undefined | null,
  locales: string[] | null | undefined,
  legacyLocale?: string | null,
): Combo[] {
  const ps: (string | null)[] = platforms && platforms.length ? [...platforms] : [null];
  const cs: (string | null)[] = connectivities && connectivities.length ? [...connectivities] : [null];
  const ls = parseLocales(locales, legacyLocale);
  const out: Combo[] = [];
  for (const p of ps) {
    for (const c of cs) {
      for (const l of ls) {
        out.push({ platform: p, connectivity: c, locale: l });
      }
    }
  }
  return out;
}

/**
 * Roll child result statuses into a single aggregate status for the parent
 * TestExecution:
 *   - any FAILED  → FAILED
 *   - any BLOCKED → BLOCKED
 *   - any PENDING → PENDING
 *   - all SKIPPED → SKIPPED
 *   - otherwise   → PASSED (mix of passed + skipped counts as passed)
 * An empty list stays PENDING.
 */
export function aggregateStatus(statuses: ExecStatus[]): ExecStatus {
  if (statuses.length === 0) return "PENDING";
  if (statuses.some((s) => s === "FAILED")) return "FAILED";
  if (statuses.some((s) => s === "BLOCKED")) return "BLOCKED";
  if (statuses.some((s) => s === "PENDING")) return "PENDING";
  if (statuses.every((s) => s === "SKIPPED")) return "SKIPPED";
  return "PASSED";
}

/**
 * Recompute and persist the aggregate status on a parent TestExecution from
 * its current child results. Returns the new status, or null if the execution
 * has no result rows (legacy single-status runs).
 */
export async function recomputeExecutionStatus(
  executionId: string,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<ExecStatus | null> {
  const results = await tx.testExecutionResult.findMany({
    where: { executionId },
    select: { status: true, executedAt: true, executedById: true },
  });
  if (results.length === 0) return null;
  const status = aggregateStatus(results.map((r) => r.status));
  // Surface the latest executedAt / executedBy onto the parent so the existing
  // dashboards and activity logs keep working without reading children.
  const withTimestamps = results.filter((r) => r.executedAt);
  const latest = withTimestamps.sort(
    (a, b) => (b.executedAt!.getTime() - a.executedAt!.getTime()),
  )[0];
  await tx.testExecution.update({
    where: { id: executionId },
    data: {
      status,
      executedAt: latest?.executedAt ?? null,
      executedById: latest?.executedById ?? null,
    },
  });
  logger.debug(
    { executionId, status, childCount: results.length },
    "execution aggregate status recomputed",
  );
  return status;
}
