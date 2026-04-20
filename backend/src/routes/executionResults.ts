import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { AuthedRequest, requireWrite } from "../middleware/auth";
import { httpError } from "../middleware/error";
import { executionWhere } from "../middleware/scope";
import { logActivity } from "../lib/activity";
import { dispatchWebhook } from "../lib/webhooks";
import { recomputeExecutionStatus } from "../lib/executionResults";

export const executionResultsRouter = Router();

const updateSchema = z.object({
  status: z.enum(["PENDING", "PASSED", "FAILED", "BLOCKED", "SKIPPED"]).optional(),
  failureReason: z.string().optional().nullable(),
  actualResult: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

/**
 * Tester finds a per-combination result by id (from the parent execution
 * payload) and patches status / reason / actual result. When status=FAILED,
 * both failureReason and actualResult are required — the rule is enforced
 * here and surfaced to the UI as RESULT_FAILED_REQUIRES_REASON_AND_DETAILS.
 */
executionResultsRouter.patch("/:id", requireWrite, async (req: AuthedRequest, res, next) => {
  try {
    const data = updateSchema.parse(req.body);

    // Load the result and confirm the caller can see its parent execution.
    const existing = await prisma.testExecutionResult.findUnique({
      where: { id: req.params.id },
      include: {
        execution: {
          include: { case: { select: { id: true, title: true } }, run: { select: { id: true, projectId: true } } },
        },
      },
    });
    if (!existing) throw httpError(404, "EXECUTION_RESULT_NOT_FOUND");
    const canSee = await prisma.testExecution.findFirst({
      where: executionWhere(req.user!, { id: existing.executionId }),
      select: { id: true },
    });
    if (!canSee) throw httpError(404, "EXECUTION_RESULT_NOT_FOUND");

    // FAILED must carry both a reason and an actual result so the Jira ticket
    // (and the next human reading the row) has something to work with.
    const nextStatus = data.status ?? existing.status;
    const nextReason = data.failureReason !== undefined ? data.failureReason : existing.failureReason;
    const nextActual = data.actualResult !== undefined ? data.actualResult : existing.actualResult;
    if (nextStatus === "FAILED") {
      const missing: string[] = [];
      if (!nextReason || !nextReason.trim()) missing.push("failureReason");
      if (!nextActual || !nextActual.trim()) missing.push("actualResult");
      if (missing.length) {
        req.log.warn(
          { resultId: existing.id, executionId: existing.executionId, missing },
          "failed result rejected — missing reason/details",
        );
        throw httpError(400, "RESULT_FAILED_REQUIRES_REASON_AND_DETAILS");
      }
    }

    const nowTerminal = data.status && data.status !== "PENDING";
    const updated = await prisma.testExecutionResult.update({
      where: { id: req.params.id },
      data: {
        ...data,
        executedById: nowTerminal ? req.user!.id : undefined,
        executedAt: nowTerminal ? new Date() : undefined,
      },
    });

    const aggregate = await recomputeExecutionStatus(existing.executionId);

    req.log.info(
      {
        resultId: updated.id,
        executionId: existing.executionId,
        runId: existing.execution.runId,
        userId: req.user!.id,
        previousStatus: existing.status,
        status: updated.status,
        aggregate,
        platform: updated.platform,
        connectivity: updated.connectivity,
        locale: updated.locale,
      },
      "execution result updated",
    );

    if (data.status && data.status !== existing.status) {
      await logActivity({
        projectId: existing.execution.run.projectId,
        userId: req.user!.id,
        action: "EXECUTION_STATUS_CHANGED",
        entityType: "executionResult",
        entityId: updated.id,
        payload: {
          from: existing.status,
          to: data.status,
          case: existing.execution.case.title,
          platform: updated.platform,
          connectivity: updated.connectivity,
          locale: updated.locale || null,
          aggregate,
        },
      });
      if (data.status === "FAILED" || data.status === "PASSED") {
        dispatchWebhook({
          projectId: existing.execution.run.projectId,
          event: data.status === "FAILED" ? "execution_result.failed" : "execution_result.passed",
          payload: {
            resultId: updated.id,
            executionId: existing.executionId,
            runId: existing.execution.runId,
            caseId: existing.execution.caseId,
            caseTitle: existing.execution.case.title,
            status: data.status,
            aggregate,
            platform: updated.platform,
            connectivity: updated.connectivity,
            locale: updated.locale,
            failureReason: updated.failureReason,
            actualResult: updated.actualResult,
            executedBy: req.user!.id,
          },
        });
      }
    }

    res.json({ result: updated, aggregateStatus: aggregate });
  } catch (e) {
    next(e);
  }
});

/**
 * Bulk "apply to all cells" — patches every result row on a parent execution
 * in one shot. Respects the same FAILED-needs-reason-and-details rule when
 * the incoming status is FAILED (the tester must fill both fields that are
 * broadcast to every cell).
 */
const bulkSchema = z.object({
  executionId: z.string(),
  status: z.enum(["PENDING", "PASSED", "FAILED", "BLOCKED", "SKIPPED"]),
  failureReason: z.string().optional().nullable(),
  actualResult: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

executionResultsRouter.post("/bulk", requireWrite, async (req: AuthedRequest, res, next) => {
  try {
    const data = bulkSchema.parse(req.body);
    const execution = await prisma.testExecution.findFirst({
      where: executionWhere(req.user!, { id: data.executionId }),
      include: { run: { select: { projectId: true } }, case: { select: { title: true } } },
    });
    if (!execution) throw httpError(404, "EXECUTION_NOT_FOUND");

    if (data.status === "FAILED") {
      const missing: string[] = [];
      if (!data.failureReason || !data.failureReason.trim()) missing.push("failureReason");
      if (!data.actualResult || !data.actualResult.trim()) missing.push("actualResult");
      if (missing.length) {
        req.log.warn(
          { executionId: execution.id, missing },
          "bulk FAILED rejected — missing reason/details",
        );
        throw httpError(400, "RESULT_FAILED_REQUIRES_REASON_AND_DETAILS");
      }
    }

    const nowTerminal = data.status !== "PENDING";
    await prisma.testExecutionResult.updateMany({
      where: { executionId: execution.id },
      data: {
        status: data.status,
        failureReason: data.failureReason ?? null,
        actualResult: data.actualResult ?? null,
        notes: data.notes ?? null,
        executedById: nowTerminal ? req.user!.id : null,
        executedAt: nowTerminal ? new Date() : null,
      },
    });

    const aggregate = await recomputeExecutionStatus(execution.id);
    req.log.info(
      { executionId: execution.id, userId: req.user!.id, status: data.status, aggregate },
      "execution results bulk-updated",
    );

    await logActivity({
      projectId: execution.run.projectId,
      userId: req.user!.id,
      action: "EXECUTION_STATUS_CHANGED",
      entityType: "execution",
      entityId: execution.id,
      payload: { bulk: true, to: data.status, case: execution.case.title, aggregate },
    });

    const results = await prisma.testExecutionResult.findMany({
      where: { executionId: execution.id },
      orderBy: { createdAt: "asc" },
    });
    res.json({ results, aggregateStatus: aggregate });
  } catch (e) {
    next(e);
  }
});
