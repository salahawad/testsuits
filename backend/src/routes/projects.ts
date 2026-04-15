import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { AuthedRequest, requireManager } from "../middleware/auth";
import { httpError } from "../middleware/error";
import { projectWhere } from "../middleware/scope";
import { logger } from "../lib/logger";

export const projectsRouter = Router();

const upsertSchema = z.object({
  key: z.string().min(1).max(16).regex(/^[A-Z0-9_-]+$/),
  name: z.string().min(1),
  description: z.string().optional().nullable(),
});

projectsRouter.get("/", async (req: AuthedRequest, res, next) => {
  try {
    const projects = await prisma.project.findMany({
      where: projectWhere(req.user!),
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { suites: true, runs: true } } },
    });
    res.json(projects);
  } catch (e) {
    next(e);
  }
});

projectsRouter.post("/", requireManager, async (req: AuthedRequest, res, next) => {
  try {
    const data = upsertSchema.parse(req.body);
    const project = await prisma.project.create({
      data: { ...data, companyId: req.user!.companyId },
    });
    logger.info({ projectId: project.id, companyId: project.companyId, createdBy: req.user!.id }, "project created");
    res.status(201).json(project);
  } catch (e) {
    next(e);
  }
});

projectsRouter.get("/:id", async (req: AuthedRequest, res, next) => {
  try {
    const project = await prisma.project.findFirst({
      where: projectWhere(req.user!, { id: req.params.id }),
      include: {
        suites: {
          where: { parentId: null },
          include: { children: true, _count: { select: { cases: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!project) throw httpError(404, "Project not found");
    res.json(project);
  } catch (e) {
    next(e);
  }
});

projectsRouter.patch("/:id", requireManager, async (req: AuthedRequest, res, next) => {
  try {
    const owned = await prisma.project.findFirst({ where: projectWhere(req.user!, { id: req.params.id }), select: { id: true } });
    if (!owned) throw httpError(404, "Project not found");
    const data = upsertSchema.partial().parse(req.body);
    const project = await prisma.project.update({ where: { id: req.params.id }, data });
    logger.info({ projectId: project.id, updatedBy: req.user!.id }, "project updated");
    res.json(project);
  } catch (e) {
    next(e);
  }
});

projectsRouter.delete("/:id", requireManager, async (req: AuthedRequest, res, next) => {
  try {
    const owned = await prisma.project.findFirst({ where: projectWhere(req.user!, { id: req.params.id }), select: { id: true } });
    if (!owned) throw httpError(404, "Project not found");
    await prisma.project.delete({ where: { id: req.params.id } });
    logger.info({ projectId: req.params.id, deletedBy: req.user!.id }, "project deleted");
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});
