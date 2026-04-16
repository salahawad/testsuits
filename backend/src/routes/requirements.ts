import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { AuthedRequest, requireManager } from "../middleware/auth";
import { httpError } from "../middleware/error";
import { caseWhere, projectWhere } from "../middleware/scope";
import { logger } from "../lib/logger";

export const requirementsRouter = Router();

const upsertSchema = z.object({
  projectId: z.string().min(1),
  externalRef: z.string().min(1).max(200),
  title: z.string().min(1).max(200),
  description: z.string().optional().nullable(),
});

const patchSchema = z.object({
  externalRef: z.string().min(1).max(200).optional(),
  title: z.string().min(1).max(200).optional(),
  description: z.string().optional().nullable(),
});

async function assertProjectInScope(req: AuthedRequest, projectId: string) {
  const p = await prisma.project.findFirst({ where: projectWhere(req.user!, { id: projectId }), select: { id: true } });
  if (!p) throw httpError(404, "PROJECT_NOT_FOUND");
}

async function loadRequirementInScope(req: AuthedRequest, id: string) {
  const row = await prisma.requirement.findFirst({
    where: { id, project: { companyId: req.user!.companyId } },
    include: {
      cases: {
        select: { id: true, title: true, suite: { select: { id: true, name: true } } },
        orderBy: { title: "asc" },
      },
    },
  });
  if (!row) throw httpError(404, "REQUIREMENT_NOT_FOUND");
  return row;
}

requirementsRouter.get("/", async (req: AuthedRequest, res, next) => {
  try {
    const projectId = typeof req.query.projectId === "string" ? req.query.projectId : undefined;
    if (!projectId) throw httpError(400, "PROJECT_ID_REQUIRED");
    await assertProjectInScope(req, projectId);
    const rows = await prisma.requirement.findMany({
      where: { projectId },
      include: { _count: { select: { cases: true } } },
      orderBy: { externalRef: "asc" },
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

requirementsRouter.get("/:id", async (req: AuthedRequest, res, next) => {
  try {
    const row = await loadRequirementInScope(req, req.params.id);
    res.json(row);
  } catch (e) {
    next(e);
  }
});

requirementsRouter.post("/", requireManager, async (req: AuthedRequest, res, next) => {
  try {
    const data = upsertSchema.parse(req.body);
    await assertProjectInScope(req, data.projectId);
    const row = await prisma.requirement.create({
      data: {
        projectId: data.projectId,
        externalRef: data.externalRef,
        title: data.title,
        description: data.description ?? null,
      },
    });
    logger.info({ requirementId: row.id, projectId: row.projectId, externalRef: row.externalRef }, "requirement created");
    res.status(201).json(row);
  } catch (e: any) {
    if (e?.code === "P2002") return next(httpError(409, "EXTERNAL_REF_DUPLICATE"));
    next(e);
  }
});

requirementsRouter.patch("/:id", requireManager, async (req: AuthedRequest, res, next) => {
  try {
    const existing = await loadRequirementInScope(req, req.params.id);
    const data = patchSchema.parse(req.body);
    const row = await prisma.requirement.update({
      where: { id: existing.id },
      data: { ...data, description: data.description === undefined ? undefined : data.description },
    });
    req.log.info({ requirementId: row.id, projectId: existing.projectId, userId: req.user!.id }, "requirement updated");
    res.json(row);
  } catch (e: any) {
    if (e?.code === "P2002") return next(httpError(409, "EXTERNAL_REF_DUPLICATE"));
    next(e);
  }
});

requirementsRouter.delete("/:id", requireManager, async (req: AuthedRequest, res, next) => {
  try {
    const existing = await loadRequirementInScope(req, req.params.id);
    await prisma.requirement.delete({ where: { id: existing.id } });
    logger.info({ requirementId: existing.id }, "requirement deleted");
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

// --- Case <-> Requirement links -------------------------------------------

const linkSchema = z.object({ caseId: z.string().min(1) });

async function assertCaseInScope(req: AuthedRequest, caseId: string, projectId: string) {
  const c = await prisma.testCase.findFirst({
    where: caseWhere(req.user!, { id: caseId, suite: { projectId } }),
    select: { id: true },
  });
  if (!c) throw httpError(404, "CASE_NOT_FOUND_IN_PROJECT");
}

requirementsRouter.post("/:id/cases", requireManager, async (req: AuthedRequest, res, next) => {
  try {
    const req_ = await loadRequirementInScope(req, req.params.id);
    const { caseId } = linkSchema.parse(req.body);
    await assertCaseInScope(req, caseId, req_.projectId);
    await prisma.requirement.update({
      where: { id: req_.id },
      data: { cases: { connect: { id: caseId } } },
    });
    req.log.info({ requirementId: req_.id, caseId, userId: req.user!.id }, "case linked to requirement");
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

requirementsRouter.delete("/:id/cases/:caseId", requireManager, async (req: AuthedRequest, res, next) => {
  try {
    const req_ = await loadRequirementInScope(req, req.params.id);
    await assertCaseInScope(req, req.params.caseId, req_.projectId);
    await prisma.requirement.update({
      where: { id: req_.id },
      data: { cases: { disconnect: { id: req.params.caseId } } },
    });
    req.log.info({ requirementId: req_.id, caseId: req.params.caseId, userId: req.user!.id }, "case unlinked from requirement");
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});
