import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { AuthedRequest, requireWrite } from "../middleware/auth";
import { httpError } from "../middleware/error";
import { caseWhere, executionWhere, runWhere } from "../middleware/scope";
import { logActivity } from "../lib/activity";

export const commentsRouter = Router();

const create = z.object({
  body: z.string().min(1),
  caseId: z.string().optional(),
  executionId: z.string().optional(),
  runId: z.string().optional(),
});

async function accessibleCommentWhere(req: AuthedRequest, target: { caseId?: string; executionId?: string; runId?: string }) {
  if (target.caseId) {
    const c = await prisma.testCase.findFirst({ where: caseWhere(req.user!, { id: target.caseId }), select: { id: true } });
    if (!c) throw httpError(404, "CASE_NOT_FOUND");
    return { caseId: target.caseId };
  }
  if (target.executionId) {
    const e = await prisma.testExecution.findFirst({ where: executionWhere(req.user!, { id: target.executionId }), select: { id: true } });
    if (!e) throw httpError(404, "EXECUTION_NOT_FOUND");
    return { executionId: target.executionId };
  }
  if (target.runId) {
    const r = await prisma.testRun.findFirst({ where: runWhere(req.user!, { id: target.runId }), select: { id: true } });
    if (!r) throw httpError(404, "RUN_NOT_FOUND");
    return { runId: target.runId };
  }
  throw httpError(400, "COMMENT_TARGET_REQUIRED");
}

commentsRouter.get("/", async (req: AuthedRequest, res, next) => {
  try {
    const where = await accessibleCommentWhere(req, req.query as any);
    const comments = await prisma.comment.findMany({
      where,
      orderBy: { createdAt: "asc" },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    res.json(comments);
  } catch (e) {
    next(e);
  }
});

commentsRouter.post("/", requireWrite, async (req: AuthedRequest, res, next) => {
  try {
    const data = create.parse(req.body);
    const where = await accessibleCommentWhere(req, data);
    const comment = await prisma.comment.create({
      data: { ...where, body: data.body, userId: req.user!.id },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    // Log activity
    let projectId: string | null = null;
    let entityType = "";
    let entityId = "";
    if (data.caseId) {
      const c = await prisma.testCase.findUnique({ where: { id: data.caseId }, include: { suite: true } });
      projectId = c?.suite.projectId ?? null;
      entityType = "case";
      entityId = data.caseId;
    } else if (data.executionId) {
      const e = await prisma.testExecution.findUnique({ where: { id: data.executionId }, include: { run: true } });
      projectId = e?.run.projectId ?? null;
      entityType = "execution";
      entityId = data.executionId;
    } else if (data.runId) {
      const r = await prisma.testRun.findUnique({ where: { id: data.runId } });
      projectId = r?.projectId ?? null;
      entityType = "run";
      entityId = data.runId;
    }
    if (projectId) {
      await logActivity({
        projectId,
        userId: req.user!.id,
        action: "COMMENT_ADDED",
        entityType,
        entityId,
        payload: { body: data.body.slice(0, 200) },
      });
    }
    req.log.info({ commentId: comment.id, entityType, entityId, userId: req.user!.id }, "comment created");
    res.status(201).json(comment);
  } catch (e) {
    next(e);
  }
});

commentsRouter.delete("/:id", requireWrite, async (req: AuthedRequest, res, next) => {
  try {
    const comment = await prisma.comment.findUnique({ where: { id: req.params.id } });
    if (!comment) throw httpError(404, "COMMENT_NOT_FOUND");
    if (comment.userId !== req.user!.id && req.user!.role !== "MANAGER") {
      throw httpError(403, "CANNOT_DELETE_OTHERS_COMMENTS");
    }
    await prisma.comment.delete({ where: { id: req.params.id } });
    req.log.info({ commentId: req.params.id, userId: req.user!.id }, "comment deleted");
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});
