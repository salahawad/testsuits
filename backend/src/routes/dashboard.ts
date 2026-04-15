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

    // --- Trend: executions per day, pass rate per day (last 30d) ----------
    const dailyRaw = await prisma.testExecution.findMany({
      where: executionWhere(req.user!, {
        ...runProjectFilter,
        executedAt: { gte: last30Days },
      }),
      select: { status: true, executedAt: true },
    });
    const buckets = new Map<string, { total: number; passed: number; failed: number }>();
    for (let i = 0; i < 30; i++) {
      const d = new Date(now);
      d.setUTCDate(d.getUTCDate() - (29 - i));
      const key = d.toISOString().slice(0, 10);
      buckets.set(key, { total: 0, passed: 0, failed: 0 });
    }
    for (const e of dailyRaw) {
      if (!e.executedAt) continue;
      const key = e.executedAt.toISOString().slice(0, 10);
      const b = buckets.get(key);
      if (!b) continue;
      b.total++;
      if (e.status === "PASSED") b.passed++;
      else if (e.status === "FAILED") b.failed++;
    }
    const trend = Array.from(buckets.entries()).map(([day, b]) => ({
      day,
      total: b.total,
      passed: b.passed,
      failed: b.failed,
      passRate: b.total ? Math.round((b.passed / b.total) * 100) : null,
    }));

    // --- Release readiness: per-milestone aggregate ----------------------
    const readinessMilestones = await prisma.milestone.findMany({
      where: milestoneWhere(req.user!, {
        ...projectFilter,
        status: { in: ["PLANNED", "ACTIVE"] },
      }),
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      take: 10,
      include: {
        project: { select: { name: true } },
        runs: { select: { id: true, executions: { select: { status: true, case: { select: { priority: true } } } } } },
      },
    });
    const releaseReadiness = readinessMilestones.map((m) => {
      const counts = { PENDING: 0, PASSED: 0, FAILED: 0, BLOCKED: 0, SKIPPED: 0 } as Record<string, number>;
      let blockerOpen = 0;
      for (const r of m.runs) for (const e of r.executions) {
        counts[e.status]++;
        if ((e.case.priority === "CRITICAL" || e.case.priority === "HIGH") && (e.status === "FAILED" || e.status === "BLOCKED")) {
          blockerOpen++;
        }
      }
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      const done = total - counts.PENDING;
      const passRateOfExecuted = done ? Math.round((counts.PASSED / done) * 100) : 0;
      return {
        id: m.id,
        name: m.name,
        project: m.project,
        dueDate: m.dueDate,
        status: m.status,
        total,
        done,
        executedPct: total ? Math.round((done / total) * 100) : 0,
        passed: counts.PASSED,
        failed: counts.FAILED,
        blocked: counts.BLOCKED,
        passRateOfExecuted,
        blockerOpen,
      };
    });

    // --- Defect aging: buckets based on first-FAILED executedAt ----------
    const failedExecs = await prisma.testExecution.findMany({
      where: executionWhere(req.user!, { ...runProjectFilter, status: "FAILED" }),
      select: { executedAt: true, createdAt: true, jiraIssueKey: true },
      take: 5000,
    });
    const ageBuckets = { "0-7d": 0, "8-30d": 0, "31-90d": 0, "90d+": 0 } as Record<string, number>;
    const dayMs = 24 * 60 * 60 * 1000;
    for (const e of failedExecs) {
      const ref = e.executedAt ?? e.createdAt;
      const ageDays = Math.floor((now.getTime() - ref.getTime()) / dayMs);
      if (ageDays <= 7) ageBuckets["0-7d"]++;
      else if (ageDays <= 30) ageBuckets["8-30d"]++;
      else if (ageDays <= 90) ageBuckets["31-90d"]++;
      else ageBuckets["90d+"]++;
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
      trend,
      releaseReadiness,
      defectAging: { buckets: ageBuckets, totalFailed: failedExecs.length },
    });
  } catch (e) {
    next(e);
  }
});
