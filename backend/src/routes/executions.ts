import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { AuthedRequest, requireWrite } from "../middleware/auth";
import { httpError } from "../middleware/error";
import { executionWhere } from "../middleware/scope";
import { logActivity } from "../lib/activity";
import { logger } from "../lib/logger";
import { dispatchWebhook } from "../lib/webhooks";

export const executionsRouter = Router();

const updateSchema = z.object({
  status: z.enum(["PENDING", "PASSED", "FAILED", "BLOCKED", "SKIPPED"]).optional(),
  notes: z.string().optional().nullable(),
  failureReason: z.string().optional().nullable(),
  actualResult: z.string().optional().nullable(),
  durationMinutes: z.number().int().positive().optional().nullable(),
  assigneeId: z.string().optional().nullable(),
  jiraIssueKey: z.string().optional().nullable(),
  jiraIssueUrl: z.string().url().optional().nullable(),
});

executionsRouter.patch("/:id", requireWrite, async (req: AuthedRequest, res, next) => {
  try {
    const data = updateSchema.parse(req.body);
    const before = await prisma.testExecution.findFirst({
      where: executionWhere(req.user!, { id: req.params.id }),
      include: { run: true },
    });
    if (!before) throw httpError(404, "EXECUTION_NOT_FOUND");

    // Managers and testers can both (re)assign executions — the assignee must
    // be a member of the caller's company, and scope middleware already
    // confirmed the execution is visible to the caller.
    if (data.assigneeId) {
      const assignee = await prisma.user.findFirst({
        where: { id: data.assigneeId, companyId: req.user!.companyId },
        select: { id: true },
      });
      if (!assignee) throw httpError(400, "ASSIGNEE_NOT_IN_COMPANY");
    }

    const execution = await prisma.testExecution.update({
      where: { id: req.params.id },
      data: {
        ...data,
        executedById: data.status && data.status !== "PENDING" ? req.user!.id : undefined,
        executedAt: data.status && data.status !== "PENDING" ? new Date() : undefined,
      },
      include: {
        case: true,
        executedBy: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true } },
      },
    });

    req.log.info(
      { executionId: execution.id, status: data.status, previousStatus: before.status, userId: req.user!.id, runId: before.runId },
      "execution updated",
    );

    if (data.status && data.status !== before.status) {
      await logActivity({
        projectId: before.run.projectId,
        userId: req.user!.id,
        action: "EXECUTION_STATUS_CHANGED",
        entityType: "execution",
        entityId: execution.id,
        payload: { from: before.status, to: data.status, case: execution.case.title },
      });
      if (data.status === "FAILED" || data.status === "PASSED") {
        dispatchWebhook({
          projectId: before.run.projectId,
          event: data.status === "FAILED" ? "execution.failed" : "execution.passed",
          payload: {
            executionId: execution.id,
            runId: before.runId,
            caseId: execution.caseId,
            caseTitle: execution.case.title,
            status: data.status,
            failureReason: execution.failureReason,
            executedBy: req.user!.id,
          },
        });
      }
    }
    if (data.assigneeId !== undefined && data.assigneeId !== before.assigneeId) {
      await logActivity({
        projectId: before.run.projectId,
        userId: req.user!.id,
        action: "EXECUTION_ASSIGNED",
        entityType: "execution",
        entityId: execution.id,
        payload: { assigneeId: data.assigneeId, case: execution.case.title },
      });
    }

    res.json(execution);
  } catch (e) {
    next(e);
  }
});

executionsRouter.get("/:id", async (req: AuthedRequest, res, next) => {
  try {
    const execution = await prisma.testExecution.findFirst({
      where: executionWhere(req.user!, { id: req.params.id }),
      include: {
        case: { include: { suite: true } },
        attachments: { include: { uploadedBy: { select: { id: true, name: true } } } },
        executedBy: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true } },
        run: true,
      },
    });
    if (!execution) return res.status(404).json({ error: "EXECUTION_NOT_FOUND" });
    res.json(execution);
  } catch (e) {
    next(e);
  }
});

executionsRouter.post("/bulk-assign", requireWrite, async (req: AuthedRequest, res, next) => {
  try {
    const { executionIds, assigneeId } = z.object({
      executionIds: z.array(z.string()).min(1),
      assigneeId: z.string().nullable(),
    }).parse(req.body);

    if (assigneeId) {
      const assignee = await prisma.user.findFirst({
        where: { id: assigneeId, companyId: req.user!.companyId },
        select: { id: true },
      });
      if (!assignee) throw httpError(400, "ASSIGNEE_NOT_IN_COMPANY");
    }

    // Only update executions the caller can see — scope middleware handles
    // company isolation and, for testers, restricts to their own assignments.
    const allowed = await prisma.testExecution.findMany({
      where: executionWhere(req.user!, { id: { in: executionIds } }),
      select: { id: true },
    });
    const ids = allowed.map((a) => a.id);
    await prisma.testExecution.updateMany({
      where: { id: { in: ids } },
      data: { assigneeId },
    });
    logger.info(
      { userId: req.user!.id, role: req.user!.role, count: ids.length, assigneeId },
      "executions bulk-assigned",
    );
    res.json({ updated: ids.length });
  } catch (e) {
    next(e);
  }
});
