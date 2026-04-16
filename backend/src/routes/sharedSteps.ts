import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { AuthedRequest, requireManager } from "../middleware/auth";
import { httpError } from "../middleware/error";
import { projectWhere } from "../middleware/scope";
import { logActivity } from "../lib/activity";

export const sharedStepsRouter = Router();

const upsertSchema = z.object({
  projectId: z.string(),
  name: z.string().trim().min(1, "Name is required").max(120),
  action: z.string().trim().min(1, "Action is required"),
  expected: z.string().trim().min(1, "Expected result is required"),
});

sharedStepsRouter.get("/", async (req: AuthedRequest, res, next) => {
  try {
    const { projectId, q } = req.query as Record<string, string | undefined>;
    if (!projectId) throw httpError(400, "PROJECT_ID_REQUIRED");
    const owned = await prisma.project.findFirst({
      where: projectWhere(req.user!, { id: projectId }),
      select: { id: true },
    });
    if (!owned) throw httpError(404, "PROJECT_NOT_FOUND");
    const steps = await prisma.sharedStep.findMany({
      where: {
        projectId,
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { action: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { updatedAt: "desc" },
      include: { createdBy: { select: { id: true, name: true } } },
    });
    res.json(steps);
  } catch (e) {
    next(e);
  }
});

sharedStepsRouter.post("/", requireManager, async (req: AuthedRequest, res, next) => {
  try {
    const data = upsertSchema.parse(req.body);
    const owned = await prisma.project.findFirst({
      where: projectWhere(req.user!, { id: data.projectId }),
      select: { id: true },
    });
    if (!owned) throw httpError(404, "PROJECT_NOT_FOUND");
    const step = await prisma.sharedStep.create({
      data: { ...data, createdById: req.user!.id },
    });
    await logActivity({
      projectId: data.projectId,
      userId: req.user!.id,
      action: "SHARED_STEP_CREATED",
      entityType: "sharedStep",
      entityId: step.id,
      payload: { name: step.name },
    });
    req.log?.info({ projectId: data.projectId, sharedStepId: step.id }, "shared step created");
    res.status(201).json(step);
  } catch (e) {
    next(e);
  }
});

sharedStepsRouter.patch("/:id", requireManager, async (req: AuthedRequest, res, next) => {
  try {
    const existing = await prisma.sharedStep.findFirst({
      where: { id: req.params.id, project: { companyId: req.user!.companyId } },
      select: { id: true, projectId: true },
    });
    if (!existing) throw httpError(404, "SHARED_STEP_NOT_FOUND");
    const data = upsertSchema.partial().omit({ projectId: true }).parse(req.body);
    const step = await prisma.sharedStep.update({
      where: { id: req.params.id },
      data,
    });
    await logActivity({
      projectId: existing.projectId,
      userId: req.user!.id,
      action: "SHARED_STEP_UPDATED",
      entityType: "sharedStep",
      entityId: step.id,
      payload: { name: step.name },
    });
    req.log.info({ sharedStepId: step.id, projectId: existing.projectId, userId: req.user!.id }, "shared step updated");
    res.json(step);
  } catch (e) {
    next(e);
  }
});

sharedStepsRouter.delete("/:id", requireManager, async (req: AuthedRequest, res, next) => {
  try {
    const existing = await prisma.sharedStep.findFirst({
      where: { id: req.params.id, project: { companyId: req.user!.companyId } },
      select: { id: true },
    });
    if (!existing) throw httpError(404, "SHARED_STEP_NOT_FOUND");
    await prisma.sharedStep.delete({ where: { id: req.params.id } });
    req.log.info({ sharedStepId: req.params.id, userId: req.user!.id }, "shared step deleted");
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});
