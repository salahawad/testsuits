import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { AuthedRequest, requireManager } from "../middleware/auth";
import { httpError } from "../middleware/error";
import { caseWhere, suiteWhere } from "../middleware/scope";
import { logActivity } from "../lib/activity";

export const casesRouter = Router();

const stepSchema = z.object({
  action: z.string().min(1),
  expected: z.string().min(1),
});

const upsertSchema = z.object({
  suiteId: z.string(),
  title: z.string().min(1),
  preconditions: z.string().optional().nullable(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  testLevel: z.enum(["SMOKE", "SANITY", "REGRESSION", "ADVANCED", "EXPLORATORY"]).optional(),
  tags: z.array(z.string()).optional(),
  steps: z.array(stepSchema).optional(),
  estimatedMinutes: z.number().int().positive().optional().nullable(),
  requirements: z.array(z.string()).optional(),
});

casesRouter.post("/", requireManager, async (req: AuthedRequest, res, next) => {
  try {
    const data = upsertSchema.parse(req.body);
    const suite = await prisma.testSuite.findFirst({ where: suiteWhere(req.user!, { id: data.suiteId }), select: { id: true } });
    if (!suite) throw httpError(404, "Suite not found");
    const testCase = await prisma.testCase.create({
      data: {
        ...data,
        steps: data.steps ?? [],
        tags: data.tags ?? [],
        requirements: data.requirements ?? [],
      },
      include: { suite: true },
    });
    await logActivity({
      projectId: testCase.suite.projectId,
      userId: req.user!.id,
      action: "CASE_CREATED",
      entityType: "case",
      entityId: testCase.id,
      payload: { title: testCase.title },
    });
    res.status(201).json(testCase);
  } catch (e) {
    next(e);
  }
});

casesRouter.get("/:id", async (req: AuthedRequest, res, next) => {
  try {
    const testCase = await prisma.testCase.findFirst({
      where: caseWhere(req.user!, { id: req.params.id }),
      include: {
        suite: { include: { project: true } },
        attachments: { include: { uploadedBy: { select: { id: true, name: true } } } },
        cloneOf: { select: { id: true, title: true } },
      },
    });
    if (!testCase) throw httpError(404, "Case not found");
    res.json(testCase);
  } catch (e) {
    next(e);
  }
});

casesRouter.patch("/:id", requireManager, async (req: AuthedRequest, res, next) => {
  try {
    const owned = await prisma.testCase.findFirst({ where: caseWhere(req.user!, { id: req.params.id }), select: { id: true } });
    if (!owned) throw httpError(404, "Case not found");
    const data = upsertSchema.partial().omit({ suiteId: true }).parse(req.body);
    const testCase = await prisma.testCase.update({
      where: { id: req.params.id },
      data: {
        ...data,
        ...(data.steps ? { steps: data.steps } : {}),
      },
      include: { suite: true },
    });
    await logActivity({
      projectId: testCase.suite.projectId,
      userId: req.user!.id,
      action: "CASE_UPDATED",
      entityType: "case",
      entityId: testCase.id,
      payload: { title: testCase.title },
    });
    res.json(testCase);
  } catch (e) {
    next(e);
  }
});

casesRouter.delete("/:id", requireManager, async (req: AuthedRequest, res, next) => {
  try {
    const owned = await prisma.testCase.findFirst({ where: caseWhere(req.user!, { id: req.params.id }), select: { id: true } });
    if (!owned) throw httpError(404, "Case not found");
    await prisma.testCase.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

casesRouter.post("/:id/clone", requireManager, async (req: AuthedRequest, res, next) => {
  try {
    const target = z.object({ suiteId: z.string().optional() }).parse(req.body);
    const source = await prisma.testCase.findFirst({
      where: caseWhere(req.user!, { id: req.params.id }),
      include: { suite: true },
    });
    if (!source) throw httpError(404, "Case not found");
    if (target.suiteId) {
      const dest = await prisma.testSuite.findFirst({ where: suiteWhere(req.user!, { id: target.suiteId }), select: { id: true } });
      if (!dest) throw httpError(404, "Destination suite not found");
    }
    const cloned = await prisma.testCase.create({
      data: {
        suiteId: target.suiteId ?? source.suiteId,
        title: `${source.title} (copy)`,
        preconditions: source.preconditions,
        priority: source.priority,
        testLevel: source.testLevel,
        tags: source.tags,
        steps: source.steps as any,
        estimatedMinutes: source.estimatedMinutes,
        requirements: source.requirements,
        cloneOfId: source.id,
      },
      include: { suite: true },
    });
    await logActivity({
      projectId: cloned.suite.projectId,
      userId: req.user!.id,
      action: "CASE_CLONED",
      entityType: "case",
      entityId: cloned.id,
      payload: { sourceId: source.id, title: cloned.title },
    });
    res.status(201).json(cloned);
  } catch (e) {
    next(e);
  }
});
