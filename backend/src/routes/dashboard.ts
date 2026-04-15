import { Router } from "express";
import { prisma } from "../db";
import { AuthedRequest } from "../middleware/auth";
import { caseWhere, executionWhere, milestoneWhere, projectWhere, runWhere } from "../middleware/scope";

export const dashboardRouter = Router();

dashboardRouter.get("/", async (req: AuthedRequest, res, next) => {
  try {
    const projectId = typeof req.query.projectId === "string" ? req.query.projectId : undefined;
    const projectFilter = projectId ? { projectId } : {};
    const runProjectFilter = projectId ? { run: { projectId } } : {};
    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      projects,
      cases,
      runs,
      executions,
      recentRuns,
      myAssignments,
      activeRunsRaw,
      upcomingMilestones,
      topFailingRaw,
      openBugs,
    ] = await Promise.all([
      prisma.project.count({ where: projectWhere(req.user!) }),
      prisma.testCase.count({ where: caseWhere(req.user!, projectId ? { suite: { projectId } } : {}) }),
      prisma.testRun.count({ where: runWhere(req.user!, projectFilter) }),
      prisma.testExecution.groupBy({
        by: ["status"],
        where: executionWhere(req.user!, runProjectFilter),
        _count: { status: true },
      }),
      prisma.testRun.findMany({
        where: runWhere(req.user!, projectFilter),
        take: 5,
        orderBy: { createdAt: "desc" },
        include: { project: true, _count: { select: { executions: true } } },
      }),
      prisma.testExecution.findMany({
        where: executionWhere(req.user!, {
          ...runProjectFilter,
          status: "PENDING",
          assigneeId: req.user!.id,
        }),
        take: 8,
        orderBy: { createdAt: "desc" },
        include: {
          case: { select: { id: true, title: true, priority: true } },
          run: { select: { id: true, name: true, dueDate: true, project: { select: { name: true } } } },
        },
      }),
      prisma.testRun.findMany({
        where: runWhere(req.user!, { ...projectFilter, status: "IN_PROGRESS" }),
        take: 5,
        orderBy: { createdAt: "desc" },
        include: {
          project: { select: { name: true } },
          executions: { select: { status: true } },
        },
      }),
      prisma.milestone.findMany({
        where: milestoneWhere(req.user!, {
          ...projectFilter,
          status: { in: ["PLANNED", "ACTIVE"] },
          dueDate: { gte: now, lte: in30Days },
        }),
        take: 5,
        orderBy: { dueDate: "asc" },
        include: { project: { select: { name: true } }, _count: { select: { runs: true } } },
      }),
      prisma.testExecution.groupBy({
        by: ["caseId"],
        where: executionWhere(req.user!, {
          ...runProjectFilter,
          status: "FAILED",
          executedAt: { gte: last30Days },
        }),
        _count: { caseId: true },
        orderBy: { _count: { caseId: "desc" } },
        take: 5,
      }),
      prisma.testExecution.findMany({
        where: executionWhere(req.user!, {
          ...runProjectFilter,
          status: "FAILED",
          jiraIssueKey: { not: null },
        }),
        distinct: ["jiraIssueKey"],
        select: { jiraIssueKey: true },
      }),
    ]);

    const statusCounts = {
      PENDING: 0,
      PASSED: 0,
      FAILED: 0,
      BLOCKED: 0,
      SKIPPED: 0,
    } as Record<string, number>;
    executions.forEach((e) => {
      statusCounts[e.status] = e._count.status;
    });
    const total = Object.values(statusCounts).reduce((a, b) => a + b, 0);
    const passRate = total > 0 ? Math.round((statusCounts.PASSED / total) * 100) : 0;

    const activeRuns = activeRunsRaw.map((r) => {
      const counts = { PENDING: 0, PASSED: 0, FAILED: 0, BLOCKED: 0, SKIPPED: 0 } as Record<string, number>;
      r.executions.forEach((e) => { counts[e.status]++; });
      const totalExec = r.executions.length;
      const done = totalExec - counts.PENDING;
      return {
        id: r.id,
        name: r.name,
        project: r.project,
        dueDate: r.dueDate,
        total: totalExec,
        done,
        progress: totalExec > 0 ? Math.round((done / totalExec) * 100) : 0,
        passed: counts.PASSED,
        failed: counts.FAILED,
      };
    });

    let topFailingCases: { id: string; title: string; suite: { name: string; project: { name: string } }; failures: number }[] = [];
    if (topFailingRaw.length > 0) {
      const caseIds = topFailingRaw.map((r) => r.caseId);
      const caseRecords = await prisma.testCase.findMany({
        where: { id: { in: caseIds } },
        select: { id: true, title: true, suite: { select: { name: true, project: { select: { name: true } } } } },
      });
      const byId = new Map(caseRecords.map((c) => [c.id, c]));
      topFailingCases = topFailingRaw
        .map((r) => {
          const c = byId.get(r.caseId);
          if (!c) return null;
          return { ...c, failures: r._count.caseId };
        })
        .filter(Boolean) as typeof topFailingCases;
    }

    res.json({
      totals: {
        projects,
        cases,
        runs,
        executions: total,
        openBugs: openBugs.length,
        myOpen: myAssignments.length,
      },
      statusCounts,
      passRate,
      recentRuns,
      myAssignments,
      activeRuns,
      upcomingMilestones,
      topFailingCases,
    });
  } catch (e) {
    next(e);
  }
});
