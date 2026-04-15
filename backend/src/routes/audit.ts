import { Router } from "express";
import { prisma } from "../db";
import { AuthedRequest, requireManager } from "../middleware/auth";

export const auditRouter = Router();

// Company-wide audit stream, with optional filters. Managers see everything;
// the /api/activity endpoint already covers per-project views. This endpoint
// exists so compliance reviewers can pull a full tenant export with a single
// call, optionally as CSV.

auditRouter.get("/", requireManager, async (req: AuthedRequest, res, next) => {
  try {
    const {
      userId,
      action,
      entityType,
      from,
      to,
      limit,
      format,
    } = req.query as Record<string, string | undefined>;
    const where: any = { project: { companyId: req.user!.companyId } };
    if (userId) where.userId = userId;
    if (action) where.action = action;
    if (entityType) where.entityType = entityType;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }
    const take = Math.min(Number(limit ?? 500), 5000);
    const rows = await prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      include: {
        user: { select: { id: true, name: true, email: true } },
        project: { select: { id: true, key: true, name: true } },
      },
    });

    if (format === "csv") {
      const header = "createdAt,user,email,project,action,entityType,entityId,payload\n";
      const escape = (v: unknown) => {
        const s = v == null ? "" : typeof v === "string" ? v : JSON.stringify(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const body = rows
        .map((r) =>
          [
            r.createdAt.toISOString(),
            r.user?.name ?? "",
            r.user?.email ?? "",
            r.project?.key ?? "",
            r.action,
            r.entityType,
            r.entityId,
            r.payload,
          ]
            .map(escape)
            .join(","),
        )
        .join("\n");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", 'attachment; filename="audit.csv"');
      res.send(header + body);
      return;
    }
    res.json(rows);
  } catch (e) {
    next(e);
  }
});
