import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { AuthedRequest, requireManager } from "../middleware/auth";
import { httpError } from "../middleware/error";
import { caseWhere, suiteWhere } from "../middleware/scope";
import { logActivity } from "../lib/activity";

export const casesRouter = Router();

const stepSchema = z.object({
  action: z.string().trim().min(1, "Step action cannot be empty"),
  expected: z.string().trim().min(1, "Step expected result cannot be empty"),
  sharedStepId: z.string().optional().nullable(),
});

const customFieldValueSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.null()]),
);

const upsertSchema = z.object({
  suiteId: z.string(),
  title: z.string().trim().min(1, "Title is required"),
  preconditions: z.string().optional().nullable(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  testLevel: z.enum(["SMOKE", "SANITY", "REGRESSION", "ADVANCED", "EXPLORATORY"]).optional(),
  tags: z.array(z.string()).optional(),
  steps: z.array(stepSchema).optional(),
  estimatedMinutes: z.number().int().positive().optional().nullable(),
  requirements: z.array(z.string()).optional(),
  customFieldValues: customFieldValueSchema.optional(),
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
        customFieldValues: data.customFieldValues ?? {},
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
        requirementLinks: { select: { id: true, externalRef: true, title: true } },
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
    const current = await prisma.testCase.findFirst({ where: caseWhere(req.user!, { id: req.params.id }) });
    if (!current) throw httpError(404, "Case not found");
    const data = upsertSchema.partial().omit({ suiteId: true }).parse(req.body);

    // Snapshot current state into history before overwriting.
    const last = await prisma.testCaseRevision.findFirst({
      where: { caseId: current.id },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    await prisma.testCaseRevision.create({
      data: {
        caseId: current.id,
        version: (last?.version ?? 0) + 1,
        title: current.title,
        preconditions: current.preconditions,
        priority: current.priority,
        testLevel: current.testLevel,
        tags: current.tags,
        steps: current.steps as any,
        estimatedMinutes: current.estimatedMinutes,
        requirements: current.requirements,
        customFieldValues: current.customFieldValues as any,
        authorId: req.user!.id,
      },
    });

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

casesRouter.get("/:id/revisions", async (req: AuthedRequest, res, next) => {
  try {
    const owned = await prisma.testCase.findFirst({ where: caseWhere(req.user!, { id: req.params.id }), select: { id: true } });
    if (!owned) throw httpError(404, "Case not found");
    const rows = await prisma.testCaseRevision.findMany({
      where: { caseId: owned.id },
      orderBy: { version: "desc" },
      take: 100,
    });
    // Attach author names in a single round-trip.
    const authorIds = Array.from(new Set(rows.map((r) => r.authorId).filter(Boolean) as string[]));
    const authors = authorIds.length
      ? await prisma.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, name: true } })
      : [];
    const byId = new Map(authors.map((a) => [a.id, a]));
    res.json(rows.map((r) => ({ ...r, author: r.authorId ? byId.get(r.authorId) ?? null : null })));
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
