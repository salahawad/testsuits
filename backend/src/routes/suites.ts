import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { AuthedRequest, requireManager } from "../middleware/auth";
import { httpError } from "../middleware/error";
import { projectWhere, suiteWhere } from "../middleware/scope";

export const suitesRouter = Router();

const createSchema = z.object({
  projectId: z.string(),
  parentId: z.string().optional().nullable(),
  name: z.string().min(1),
  description: z.string().optional().nullable(),
});

suitesRouter.post("/", requireManager, async (req: AuthedRequest, res, next) => {
  try {
    const data = createSchema.parse(req.body);
    const project = await prisma.project.findFirst({ where: projectWhere(req.user!, { id: data.projectId }), select: { id: true } });
    if (!project) throw httpError(404, "Project not found");
    const suite = await prisma.testSuite.create({ data });
    res.status(201).json(suite);
  } catch (e) {
    next(e);
  }
});

suitesRouter.get("/:id", async (req: AuthedRequest, res, next) => {
  try {
    const suite = await prisma.testSuite.findFirst({
      where: suiteWhere(req.user!, { id: req.params.id }),
      include: {
        children: { include: { _count: { select: { cases: true } } } },
        cases: { orderBy: { createdAt: "asc" } },
        project: true,
      },
    });
    if (!suite) throw httpError(404, "Suite not found");
    res.json(suite);
  } catch (e) {
    next(e);
  }
});

suitesRouter.patch("/:id", requireManager, async (req: AuthedRequest, res, next) => {
  try {
    const owned = await prisma.testSuite.findFirst({ where: suiteWhere(req.user!, { id: req.params.id }), select: { id: true } });
    if (!owned) throw httpError(404, "Suite not found");
    const data = createSchema.partial().omit({ projectId: true }).parse(req.body);
    const suite = await prisma.testSuite.update({ where: { id: req.params.id }, data });
    res.json(suite);
  } catch (e) {
    next(e);
  }
});

suitesRouter.delete("/:id", requireManager, async (req: AuthedRequest, res, next) => {
  try {
    const owned = await prisma.testSuite.findFirst({ where: suiteWhere(req.user!, { id: req.params.id }), select: { id: true } });
    if (!owned) throw httpError(404, "Suite not found");
    await prisma.testSuite.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});
