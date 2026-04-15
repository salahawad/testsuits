import { Router } from "express";
import { prisma } from "../db";
import { AuthedRequest } from "../middleware/auth";

export const activityRouter = Router();

activityRouter.get("/", async (req: AuthedRequest, res, next) => {
  try {
    const { projectId, entityType, entityId, limit } = req.query as Record<string, string | undefined>;
    const where: any = { project: { companyId: req.user!.companyId } };
    if (projectId) where.projectId = projectId;
    if (entityType) where.entityType = entityType;
    if (entityId) where.entityId = entityId;
    const take = Math.min(Number(limit ?? 50), 200);
    const activities = await prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      include: { user: { select: { id: true, name: true } } },
    });
    res.json(activities);
  } catch (e) {
    next(e);
  }
});
