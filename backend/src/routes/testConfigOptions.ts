import { Router } from "express";
import { z } from "zod";
import { TestConfigKind } from "@prisma/client";
import { prisma } from "../db";
import { AuthedRequest, requireManager } from "../middleware/auth";
import { httpError } from "../middleware/error";

export const testConfigOptionsRouter = Router();

const KINDS = ["PLATFORM", "CONNECTIVITY", "LOCALE"] as const satisfies ReadonlyArray<TestConfigKind>;

const createSchema = z.object({
  kind: z.enum(KINDS),
  code: z.string().trim().min(1).max(40),
  label: z.string().trim().min(1).max(80),
  sortOrder: z.number().int().optional(),
});

const updateSchema = z.object({
  label: z.string().trim().min(1).max(80).optional(),
  sortOrder: z.number().int().optional(),
  // Pass `deletedAt: null` to restore a previously soft-deleted row.
  restore: z.boolean().optional(),
});

testConfigOptionsRouter.get("/", async (req: AuthedRequest, res, next) => {
  try {
    const kind = (req.query.kind as string | undefined)?.toUpperCase();
    const includeDeleted = req.query.includeDeleted === "true";
    const where: Record<string, unknown> = { companyId: req.user!.companyId };
    if (kind && (KINDS as readonly string[]).includes(kind)) where.kind = kind;
    if (!includeDeleted) where.deletedAt = null;
    const options = await prisma.testConfigOption.findMany({
      where,
      orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { code: "asc" }],
    });
    res.json(options);
  } catch (e) {
    next(e);
  }
});

testConfigOptionsRouter.post("/", requireManager, async (req: AuthedRequest, res, next) => {
  try {
    const data = createSchema.parse(req.body);
    // Upsert so re-adding a soft-deleted code quietly restores it with the
    // new label — far friendlier than a 409 for an admin who just un-hid an
    // option they previously removed.
    const option = await prisma.testConfigOption.upsert({
      where: {
        companyId_kind_code: {
          companyId: req.user!.companyId,
          kind: data.kind,
          code: data.code,
        },
      },
      create: {
        companyId: req.user!.companyId,
        kind: data.kind,
        code: data.code,
        label: data.label,
        sortOrder: data.sortOrder ?? 0,
      },
      update: {
        label: data.label,
        sortOrder: data.sortOrder ?? undefined,
        deletedAt: null,
      },
    });
    req.log.info(
      { optionId: option.id, kind: option.kind, code: option.code, userId: req.user!.id },
      "test config option saved",
    );
    res.status(201).json(option);
  } catch (e) {
    next(e);
  }
});

testConfigOptionsRouter.patch("/:id", requireManager, async (req: AuthedRequest, res, next) => {
  try {
    const data = updateSchema.parse(req.body);
    const existing = await prisma.testConfigOption.findFirst({
      where: { id: req.params.id, companyId: req.user!.companyId },
    });
    if (!existing) throw httpError(404, "CONFIG_OPTION_NOT_FOUND");
    const option = await prisma.testConfigOption.update({
      where: { id: req.params.id },
      data: {
        label: data.label ?? undefined,
        sortOrder: data.sortOrder ?? undefined,
        deletedAt: data.restore ? null : undefined,
      },
    });
    req.log.info(
      { optionId: option.id, userId: req.user!.id, restore: !!data.restore },
      "test config option updated",
    );
    res.json(option);
  } catch (e) {
    next(e);
  }
});

testConfigOptionsRouter.delete("/:id", requireManager, async (req: AuthedRequest, res, next) => {
  try {
    const existing = await prisma.testConfigOption.findFirst({
      where: { id: req.params.id, companyId: req.user!.companyId },
    });
    if (!existing) throw httpError(404, "CONFIG_OPTION_NOT_FOUND");
    const option = await prisma.testConfigOption.update({
      where: { id: req.params.id },
      data: { deletedAt: new Date() },
    });
    req.log.info(
      { optionId: option.id, kind: option.kind, code: option.code, userId: req.user!.id },
      "test config option soft-deleted",
    );
    res.json(option);
  } catch (e) {
    next(e);
  }
});
