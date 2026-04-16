import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { AuthedRequest, requireManager } from "../middleware/auth";
import { httpError } from "../middleware/error";
import { milestoneWhere, projectWhere } from "../middleware/scope";
import { logger } from "../lib/logger";

export const milestonesRouter = Router();

const upsert = z.object({
  projectId: z.string().optional(),
  name: z.string().trim().min(1, "Milestone name is required"),
  description: z.string().optional().nullable(),
  status: z.enum(["PLANNED", "ACTIVE", "RELEASED", "CANCELLED"]).optional(),
  dueDate: z.string().datetime().optional().nullable(),
});

milestonesRouter.get("/", async (req: AuthedRequest, res, next) => {
  try {
    const projectId = typeof req.query.projectId === "string" ? req.query.projectId : undefined;
    const milestones = await prisma.milestone.findMany({
      where: milestoneWhere(req.user!, projectId ? { projectId } : {}),
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      include: { _count: { select: { runs: true } } },
    });
    res.json(milestones);
  } catch (e) {
    next(e);
  }
});

milestonesRouter.post("/", requireManager, async (req: AuthedRequest, res, next) => {
  try {
    const data = upsert.parse(req.body);
    if (!data.projectId) throw httpError(400, "PROJECT_ID_REQUIRED");
    const project = await prisma.project.findFirst({ where: projectWhere(req.user!, { id: data.projectId }), select: { id: true } });
    if (!project) throw httpError(404, "PROJECT_NOT_FOUND");
    const milestone = await prisma.milestone.create({
      data: {
        projectId: data.projectId,
        name: data.name,
        description: data.description,
        status: data.status,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
      },
    });
    req.log.info({ milestoneId: milestone.id, projectId: data.projectId, userId: req.user!.id }, "milestone created");
    res.status(201).json(milestone);
  } catch (e) {
    next(e);
  }
});

milestonesRouter.patch("/:id", requireManager, async (req: AuthedRequest, res, next) => {
  try {
    const owned = await prisma.milestone.findFirst({ where: milestoneWhere(req.user!, { id: req.params.id }), select: { id: true } });
    if (!owned) throw httpError(404, "MILESTONE_NOT_FOUND");
    const data = upsert.partial().parse(req.body);
    const milestone = await prisma.milestone.update({
      where: { id: req.params.id },
      data: {
        ...data,
        dueDate: data.dueDate ? new Date(data.dueDate) : data.dueDate === null ? null : undefined,
      },
    });
    req.log.info({ milestoneId: milestone.id, userId: req.user!.id }, "milestone updated");
    res.json(milestone);
  } catch (e) {
    next(e);
  }
});

milestonesRouter.delete("/:id", requireManager, async (req: AuthedRequest, res, next) => {
  try {
    const owned = await prisma.milestone.findFirst({ where: milestoneWhere(req.user!, { id: req.params.id }), select: { id: true } });
    if (!owned) throw httpError(404, "MILESTONE_NOT_FOUND");
    await prisma.milestone.delete({ where: { id: req.params.id } });
    req.log.info({ milestoneId: req.params.id, userId: req.user!.id }, "milestone deleted");
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});
