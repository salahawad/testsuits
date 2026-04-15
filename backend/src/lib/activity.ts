import { ActivityAction, Prisma } from "@prisma/client";
import { prisma } from "../db";
import { logger } from "./logger";

export async function logActivity(input: {
  projectId: string;
  userId?: string | null;
  action: ActivityAction;
  entityType: string;
  entityId: string;
  payload?: Prisma.InputJsonValue;
}) {
  try {
    await prisma.activityLog.create({
      data: {
        projectId: input.projectId,
        userId: input.userId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        payload: input.payload ?? Prisma.JsonNull,
      },
    });
  } catch (err) {
    logger.error({ err, input }, "activity log write failed");
  }
}
