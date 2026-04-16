import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { AuthedRequest, requireManager, requireWrite } from "../middleware/auth";
import { httpError } from "../middleware/error";
import { caseWhere, projectWhere, runWhere, suiteWhere } from "../middleware/scope";
import { logActivity } from "../lib/activity";
import { dispatchWebhook } from "../lib/webhooks";
import { logger } from "../lib/logger";

export const runsRouter = Router();

const PLATFORMS = ["WEB", "WINDOWS", "MACOS", "ANDROID", "IOS"] as const;
const CONNECTIVITY = ["ONLINE", "OFFLINE"] as const;

const createSchema = z.object({
  projectId: z.string(),
  milestoneId: z.string().optional().nullable(),
  name: z.string().trim().min(1, "Run name is required"),
  description: z.string().optional().nullable(),
  environment: z.string().trim().min(1, "Environment is required"),
  platform: z.enum(PLATFORMS).optional().nullable(),
  connectivity: z.enum(CONNECTIVITY).optional().nullable(),
  locale: z.string().optional().nullable(),
  testLevels: z.array(z.enum(["SMOKE", "SANITY", "REGRESSION", "ADVANCED", "EXPLORATORY"])).optional(),
  dueDate: z.string().datetime().optional().nullable(),
  caseIds: z.array(z.string()).optional(),
  suiteIds: z.array(z.string()).optional(),
  assigneeId: z.string().optional().nullable(),
});

runsRouter.get("/", async (req: AuthedRequest, res, next) => {
  try {
    const { projectId, milestoneId, status, archived } = req.query as Record<string, string | undefined>;
    const extra: any = {};
    if (projectId) extra.projectId = projectId;
    if (milestoneId) extra.milestoneId = milestoneId;
    if (status) {
      extra.status = status;
    } else if (archived === "true") {
      extra.status = "ARCHIVED";
    } else {
      extra.status = { not: "ARCHIVED" };
    }
    const runs = await prisma.testRun.findMany({
      where: runWhere(req.user!, extra),
      orderBy: { createdAt: "desc" },
      include: {
        project: true,
        milestone: true,
        createdBy: { select: { id: true, name: true } },
        _count: { select: { executions: true } },
      },
    });
    res.json(runs);
  } catch (e) {
    next(e);
  }
});

runsRouter.post("/", requireWrite, async (req: AuthedRequest, res, next) => {
  try {
    const data = createSchema.parse(req.body);
    const project = await prisma.project.findFirst({ where: projectWhere(req.user!, { id: data.projectId }), select: { id: true } });
    if (!project) throw httpError(404, "PROJECT_NOT_FOUND");

    const caseIds = new Set(data.caseIds ?? []);
    if (data.suiteIds?.length) {
      const cases = await prisma.testCase.findMany({
        where: caseWhere(req.user!, {
          suiteId: { in: data.suiteIds },
          ...(data.testLevels?.length ? { testLevel: { in: data.testLevels } } : {}),
        }),
        select: { id: true },
      });
      cases.forEach((c) => caseIds.add(c.id));
    }
    if (caseIds.size === 0) throw httpError(400, "RUN_REQUIRES_CASES");

    if (data.assigneeId) {
      const assignee = await prisma.user.findFirst({
        where: { id: data.assigneeId, companyId: req.user!.companyId },
        select: { id: true },
      });
      if (!assignee) throw httpError(400, "ASSIGNEE_NOT_IN_COMPANY");
    }

    const run = await prisma.testRun.create({
      data: {
        projectId: data.projectId,
        milestoneId: data.milestoneId ?? null,
        name: data.name,
        description: data.description,
        environment: data.environment,
        platform: data.platform ?? null,
        connectivity: data.connectivity ?? null,
        locale: data.locale ?? null,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        createdById: req.user!.id,
        executions: {
          create: Array.from(caseIds).map((caseId) => ({
            caseId,
            assigneeId: data.assigneeId ?? null,
          })),
        },
      },
    });

    req.log.info({ runId: run.id, projectId: data.projectId, userId: req.user!.id, caseCount: caseIds.size }, "run created");

    await logActivity({
      projectId: run.projectId,
      userId: req.user!.id,
      action: "RUN_CREATED",
      entityType: "run",
      entityId: run.id,
      payload: { name: run.name, caseCount: caseIds.size },
    });
    dispatchWebhook({
      projectId: run.projectId,
      event: "run.created",
      payload: {
        runId: run.id,
        name: run.name,
        caseCount: caseIds.size,
        createdBy: req.user!.id,
      },
    });

    res.status(201).json(run);
  } catch (e) {
    next(e);
  }
});

runsRouter.get("/:id", async (req: AuthedRequest, res, next) => {
  try {
    const run = await prisma.testRun.findFirst({
      where: runWhere(req.user!, { id: req.params.id }),
      include: {
        project: true,
        milestone: true,
        createdBy: { select: { id: true, name: true } },
        executions: {
          orderBy: { createdAt: "asc" },
          include: {
            case: { include: { suite: true } },
            executedBy: { select: { id: true, name: true } },
            assignee: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!run) throw httpError(404, "RUN_NOT_FOUND");

    // Tester sees only their own executions within the run
    if (req.user!.role === "TESTER") {
      run.executions = run.executions.filter(
        (e) => e.assigneeId === req.user!.id || e.executedById === req.user!.id,
      );
    }
    res.json(run);
  } catch (e) {
    next(e);
  }
});

runsRouter.patch("/:id", requireManager, async (req: AuthedRequest, res, next) => {
  try {
    const owned = await prisma.testRun.findFirst({ where: runWhere(req.user!, { id: req.params.id }), select: { id: true, projectId: true, status: true, name: true } });
    if (!owned) throw httpError(404, "RUN_NOT_FOUND");
    const data = z
      .object({
        name: z.string().trim().min(1, "Run name cannot be empty").optional(),
        description: z.string().optional().nullable(),
        environment: z.string().optional().nullable(),
        platform: z.enum(PLATFORMS).optional().nullable(),
        connectivity: z.enum(CONNECTIVITY).optional().nullable(),
        locale: z.string().optional().nullable(),
        milestoneId: z.string().optional().nullable(),
        dueDate: z.string().datetime().optional().nullable(),
        status: z.enum(["DRAFT", "IN_PROGRESS", "COMPLETED", "ARCHIVED"]).optional(),
      })
      .parse(req.body);
    const run = await prisma.testRun.update({
      where: { id: req.params.id },
      data: {
        ...data,
        dueDate: data.dueDate ? new Date(data.dueDate) : data.dueDate === null ? null : undefined,
        completedAt: data.status === "COMPLETED" ? new Date() : undefined,
      },
    });
    req.log.info({ runId: req.params.id, userId: req.user!.id, status: data.status }, "run updated");
    if (data.status) {
      await logActivity({
        projectId: run.projectId,
        userId: req.user!.id,
        action: "RUN_STATUS_CHANGED",
        entityType: "run",
        entityId: run.id,
        payload: { from: owned.status, to: data.status, name: owned.name },
      });
      if (data.status === "COMPLETED") {
        dispatchWebhook({
          projectId: run.projectId,
          event: "run.completed",
          payload: { runId: run.id, name: run.name, completedBy: req.user!.id },
        });
      }
      if (data.status === "ARCHIVED") {
        req.log.info({ runId: run.id, projectId: run.projectId }, "run archived");
        dispatchWebhook({
          projectId: run.projectId,
          event: "run.archived",
          payload: { runId: run.id, name: run.name, archivedBy: req.user!.id },
        });
      }
    }
    res.json(run);
  } catch (e) {
    next(e);
  }
});

runsRouter.delete("/:id", requireManager, async (req: AuthedRequest, res, next) => {
  try {
    const owned = await prisma.testRun.findFirst({ where: runWhere(req.user!, { id: req.params.id }), select: { id: true } });
    if (!owned) throw httpError(404, "RUN_NOT_FOUND");
    await prisma.testRun.delete({ where: { id: req.params.id } });
    req.log.info({ runId: req.params.id, userId: req.user!.id }, "run deleted");
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

runsRouter.get("/:id/export.csv", async (req: AuthedRequest, res, next) => {
  try {
    const run = await prisma.testRun.findFirst({
      where: runWhere(req.user!, { id: req.params.id }),
      include: {
        executions: {
          include: {
            case: { include: { suite: true } },
            executedBy: { select: { name: true } },
            assignee: { select: { name: true } },
          },
        },
      },
    });
    if (!run) throw httpError(404, "RUN_NOT_FOUND");

    const execs = req.user!.role === "TESTER"
      ? run.executions.filter((e) => e.assigneeId === req.user!.id || e.executedById === req.user!.id)
      : run.executions;

    const esc = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const header = [
      "Suite", "Case", "Priority", "Status", "Assignee", "Executed by",
      "Executed at", "Duration (min)", "Failure reason", "Actual result",
      "Notes", "Jira issue",
    ];
    const rows = execs.map((e) => [
      e.case.suite.name, e.case.title, e.case.priority, e.status,
      e.assignee?.name ?? "", e.executedBy?.name ?? "",
      e.executedAt?.toISOString() ?? "", e.durationMinutes ?? "",
      e.failureReason ?? "", e.actualResult ?? "", e.notes ?? "",
      e.jiraIssueKey ?? "",
    ]);
    const csv = [header, ...rows].map((r) => r.map(esc).join(",")).join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="run-${run.id}.csv"`);
    res.send(csv);
  } catch (e) {
    next(e);
  }
});
