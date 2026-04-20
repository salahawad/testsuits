import { Router } from "express";
import { prisma } from "../db";
import { AuthedRequest } from "../middleware/auth";
import { httpError } from "../middleware/error";
import { caseWhere, executionWhere, projectWhere } from "../middleware/scope";
import { logger } from "../lib/logger";

export const matrixRouter = Router();

type Dimension = "platform" | "connectivity" | "locale" | "requirement";
const VALID_DIMENSIONS: Dimension[] = ["platform", "connectivity", "locale", "requirement"];
const RUN_DIMENSIONS: Array<Exclude<Dimension, "requirement">> = ["platform", "connectivity", "locale"];

matrixRouter.get("/projects/:projectId", async (req: AuthedRequest, res, next) => {
  try {
    const { projectId } = req.params;
    const dimension = ((req.query.dimension as Dimension) ?? "platform") as Dimension;
    if (!VALID_DIMENSIONS.includes(dimension)) {
      throw httpError(400, "INVALID_DIMENSION");
    }

    const project = await prisma.project.findFirst({ where: projectWhere(req.user!, { id: projectId }) });
    if (!project) throw httpError(404, "PROJECT_NOT_FOUND");

    // --- Requirement pivot: columns are requirements, rows still cases.
    // A cell is populated only when the case is linked to that requirement.
    if (dimension === "requirement") {
      const cases = await prisma.testCase.findMany({
        where: caseWhere(req.user!, { suite: { projectId } }),
        select: {
          id: true,
          title: true,
          testLevel: true,
          priority: true,
          suite: { select: { id: true, name: true } },
          requirementLinks: { select: { id: true, externalRef: true, title: true } },
        },
        orderBy: [{ suite: { name: "asc" } }, { title: "asc" }],
      });

      const requirements = await prisma.requirement.findMany({
        where: { projectId },
        select: { id: true, externalRef: true, title: true },
        orderBy: { externalRef: "asc" },
      });

      // latest non-PENDING execution per case, regardless of run config
      const executions = await prisma.testExecution.findMany({
        where: executionWhere(req.user!, { run: { projectId }, status: { not: "PENDING" } }),
        select: {
          caseId: true,
          status: true,
          executedAt: true,
          run: { select: { id: true, name: true } },
        },
      });

      const latestByCase = new Map<string, { status: string; executedAt: Date | null; runId: string; runName: string }>();
      for (const exec of executions) {
        const prior = latestByCase.get(exec.caseId);
        if (
          !prior ||
          (exec.executedAt && prior.executedAt && exec.executedAt > prior.executedAt) ||
          (!prior.executedAt && exec.executedAt)
        ) {
          latestByCase.set(exec.caseId, {
            status: exec.status,
            executedAt: exec.executedAt,
            runId: exec.run.id,
            runName: exec.run.name,
          });
        }
      }

      const buckets = requirements.map((r) => r.externalRef);
      const bucketMeta = Object.fromEntries(requirements.map((r) => [r.externalRef, { title: r.title, id: r.id }]));

      logger.info(
        { projectId, dimension, cases: cases.length, requirements: requirements.length, executions: executions.length },
        "matrix report generated",
      );

      res.json({
        dimension,
        buckets,
        bucketMeta,
        rows: cases.map((c) => {
          const linkedRefs = new Set(c.requirementLinks.map((r) => r.externalRef));
          const latest = latestByCase.get(c.id);
          return {
            caseId: c.id,
            title: c.title,
            testLevel: c.testLevel,
            priority: c.priority,
            suite: c.suite,
            cells: buckets.map((b) => (linkedRefs.has(b) ? latest ?? { status: "UNTESTED", executedAt: null, runId: "", runName: "" } : null)),
          };
        }),
      });
      return;
    }

    // --- Run-dimension pivots (platform/connectivity/locale)
    const cases = await prisma.testCase.findMany({
      where: caseWhere(req.user!, { suite: { projectId } }),
      select: {
        id: true,
        title: true,
        testLevel: true,
        priority: true,
        suite: { select: { id: true, name: true } },
      },
      orderBy: [{ suite: { name: "asc" } }, { title: "asc" }],
    });

    // Per-combo rows come first — they are the authoritative per-bucket status.
    // Legacy executions (empty results[]) fall back to broadcasting the parent
    // aggregate status to every bucket the run covers.
    const [perCombo, legacyExecs] = await Promise.all([
      prisma.testExecutionResult.findMany({
        where: {
          status: { not: "PENDING" },
          execution: executionWhere(req.user!, { run: { projectId } }),
        },
        select: {
          platform: true,
          connectivity: true,
          locale: true,
          status: true,
          executedAt: true,
          execution: {
            select: {
              caseId: true,
              run: { select: { id: true, name: true } },
            },
          },
        },
      }),
      prisma.testExecution.findMany({
        where: executionWhere(req.user!, { run: { projectId }, status: { not: "PENDING" }, results: { none: {} } }),
        select: {
          caseId: true,
          status: true,
          executedAt: true,
          run: {
            select: { id: true, name: true, platforms: true, connectivities: true, locales: true, locale: true, environment: true },
          },
        },
      }),
    ]);

    const bucketValues = new Set<string>();
    const latestByCaseAndBucket = new Map<string, { status: string; executedAt: Date | null; runId: string; runName: string }>();

    function upsert(key: string, entry: { status: string; executedAt: Date | null; runId: string; runName: string }) {
      const prior = latestByCaseAndBucket.get(key);
      if (
        !prior ||
        (entry.executedAt && prior.executedAt && entry.executedAt > prior.executedAt) ||
        (!prior.executedAt && entry.executedAt)
      ) {
        latestByCaseAndBucket.set(key, entry);
      }
    }

    for (const r of perCombo) {
      let raw: unknown = null;
      if (dimension === "platform") raw = r.platform;
      else if (dimension === "connectivity") raw = r.connectivity;
      else if (dimension === "locale") raw = r.locale;
      if (raw == null || raw === "") continue;
      const bucket = String(raw);
      bucketValues.add(bucket);
      upsert(`${r.execution.caseId}::${bucket}`, {
        status: r.status,
        executedAt: r.executedAt,
        runId: r.execution.run.id,
        runName: r.execution.run.name,
      });
    }

    const dimensionFieldMap: Record<string, string> = { platform: "platforms", connectivity: "connectivities", locale: "locales" };
    for (const exec of legacyExecs) {
      const field = dimensionFieldMap[dimension] ?? dimension;
      let raw = exec.run[field as keyof typeof exec.run] as unknown;
      // Fall back to the legacy scalar for locale-dimension runs that predate
      // the multi-select `locales` array.
      if (dimension === "locale" && (!Array.isArray(raw) || (raw as string[]).length === 0)) {
        raw = exec.run.locale ?? "—";
      }
      const values = Array.isArray(raw) ? (raw.length ? (raw as string[]) : ["—"]) : [raw ?? "—"];
      for (const v of values) {
        const bucket = String(v);
        bucketValues.add(bucket);
        upsert(`${exec.caseId}::${bucket}`, {
          status: exec.status,
          executedAt: exec.executedAt,
          runId: exec.run.id,
          runName: exec.run.name,
        });
      }
    }

    const buckets = Array.from(bucketValues).sort();
    logger.info(
      {
        projectId,
        dimension,
        cases: cases.length,
        buckets: buckets.length,
        perComboRows: perCombo.length,
        legacyExecutions: legacyExecs.length,
      },
      "matrix report generated",
    );

    res.json({
      dimension,
      buckets,
      rows: cases.map((c) => ({
        caseId: c.id,
        title: c.title,
        testLevel: c.testLevel,
        priority: c.priority,
        suite: c.suite,
        cells: buckets.map((b) => latestByCaseAndBucket.get(`${c.id}::${b}`) ?? null),
      })),
    });
  } catch (e) {
    next(e);
  }
});
void RUN_DIMENSIONS;
