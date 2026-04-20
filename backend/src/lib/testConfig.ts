import { Prisma, TestConfigKind } from "@prisma/client";
import { prisma } from "../db";
import { logger } from "./logger";

// Canonical defaults every new company starts with. Extend here when the
// product ships with new built-in options. Companies can add to or hide any
// of these through the UI without affecting other tenants.
export const DEFAULT_OPTIONS: Record<TestConfigKind, Array<{ code: string; label: string }>> = {
  PLATFORM: [
    { code: "WEB", label: "Web" },
    { code: "WINDOWS", label: "Windows" },
    { code: "ANDROID", label: "Android" },
    { code: "IOS", label: "iOS" },
  ],
  CONNECTIVITY: [
    { code: "ONLINE", label: "Online" },
    { code: "OFFLINE", label: "Offline" },
  ],
  LOCALE: [
    { code: "en", label: "English" },
    { code: "fr", label: "French" },
    { code: "es", label: "Spanish" },
    { code: "pl", label: "Polish" },
    { code: "hu", label: "Hungarian" },
    { code: "de", label: "German" },
  ],
};

/**
 * Ensure the given company has the default option rows. Idempotent — safe to
 * call from seed scripts, signup, and a one-shot backfill on app startup. Uses
 * an upsert against (companyId, kind, code) so existing rows (including ones
 * the company has soft-deleted) are not disturbed.
 */
export async function ensureDefaultOptions(
  companyId: string,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<void> {
  let created = 0;
  for (const [kind, opts] of Object.entries(DEFAULT_OPTIONS) as Array<
    [TestConfigKind, Array<{ code: string; label: string }>]
  >) {
    for (let i = 0; i < opts.length; i++) {
      const opt = opts[i];
      const existing = await tx.testConfigOption.findUnique({
        where: { companyId_kind_code: { companyId, kind, code: opt.code } },
        select: { id: true },
      });
      if (existing) continue;
      await tx.testConfigOption.create({
        data: { companyId, kind, code: opt.code, label: opt.label, sortOrder: i },
      });
      created++;
    }
  }
  if (created > 0) {
    logger.info({ companyId, created }, "seeded default test config options");
  }
}

/**
 * Backfill all existing companies with the default options once, at server
 * startup. Never removes or overrides rows — just fills in the missing ones.
 */
export async function backfillDefaultOptionsForAllCompanies(): Promise<void> {
  const companies = await prisma.company.findMany({ select: { id: true } });
  for (const c of companies) {
    await ensureDefaultOptions(c.id);
  }
  logger.info({ companyCount: companies.length }, "default test config options backfill complete");
}
