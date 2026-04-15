import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { AuthedRequest, requireManager } from "../middleware/auth";
import { httpError } from "../middleware/error";
import { projectWhere } from "../middleware/scope";
import { logActivity } from "../lib/activity";
import { WEBHOOK_EVENTS, dispatchWebhook } from "../lib/webhooks";

export const webhooksRouter = Router();

const eventEnum = z.enum(WEBHOOK_EVENTS);

const upsertSchema = z.object({
  projectId: z.string(),
  url: z.string().url(),
  secret: z.string().max(200).optional().nullable(),
  events: z.array(eventEnum).min(1),
  active: z.boolean().optional(),
});

webhooksRouter.get("/events", (_req, res) => {
  res.json(WEBHOOK_EVENTS);
});

webhooksRouter.get("/", async (req: AuthedRequest, res, next) => {
  try {
    const { projectId } = req.query as Record<string, string | undefined>;
    if (!projectId) throw httpError(400, "projectId is required");
    const owned = await prisma.project.findFirst({
      where: projectWhere(req.user!, { id: projectId }),
      select: { id: true },
    });
    if (!owned) throw httpError(404, "Project not found");
    const hooks = await prisma.webhook.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      include: {
        deliveries: { orderBy: { attemptedAt: "desc" }, take: 5 },
      },
    });
    // Never leak secrets back to the client — we only expose whether one is set.
    res.json(
      hooks.map(({ secret, ...rest }) => ({
        ...rest,
        hasSecret: !!secret,
      })),
    );
  } catch (e) {
    next(e);
  }
});

webhooksRouter.post("/", requireManager, async (req: AuthedRequest, res, next) => {
  try {
    const data = upsertSchema.parse(req.body);
    const owned = await prisma.project.findFirst({
      where: projectWhere(req.user!, { id: data.projectId }),
      select: { id: true },
    });
    if (!owned) throw httpError(404, "Project not found");
    const hook = await prisma.webhook.create({
      data: {
        projectId: data.projectId,
        url: data.url,
        secret: data.secret ?? null,
        events: data.events,
        active: data.active ?? true,
      },
    });
    await logActivity({
      projectId: data.projectId,
      userId: req.user!.id,
      action: "WEBHOOK_CONFIGURED",
      entityType: "webhook",
      entityId: hook.id,
      payload: { url: hook.url, events: hook.events },
    });
    req.log?.info({ projectId: data.projectId, hookId: hook.id, events: data.events }, "webhook created");
    const { secret, ...rest } = hook;
    res.status(201).json({ ...rest, hasSecret: !!secret });
  } catch (e) {
    next(e);
  }
});

webhooksRouter.patch("/:id", requireManager, async (req: AuthedRequest, res, next) => {
  try {
    const existing = await prisma.webhook.findFirst({
      where: { id: req.params.id, project: { companyId: req.user!.companyId } },
      select: { id: true, projectId: true },
    });
    if (!existing) throw httpError(404, "Webhook not found");
    const data = upsertSchema.partial().omit({ projectId: true }).parse(req.body);
    const hook = await prisma.webhook.update({
      where: { id: req.params.id },
      data: {
        ...(data.url !== undefined ? { url: data.url } : {}),
        ...(data.events !== undefined ? { events: data.events } : {}),
        ...(data.active !== undefined ? { active: data.active } : {}),
        // `secret: null` explicitly clears; `undefined` leaves it untouched.
        ...(data.secret !== undefined ? { secret: data.secret } : {}),
      },
    });
    await logActivity({
      projectId: existing.projectId,
      userId: req.user!.id,
      action: "WEBHOOK_CONFIGURED",
      entityType: "webhook",
      entityId: hook.id,
      payload: { url: hook.url, events: hook.events, active: hook.active },
    });
    const { secret, ...rest } = hook;
    res.json({ ...rest, hasSecret: !!secret });
  } catch (e) {
    next(e);
  }
});

webhooksRouter.delete("/:id", requireManager, async (req: AuthedRequest, res, next) => {
  try {
    const existing = await prisma.webhook.findFirst({
      where: { id: req.params.id, project: { companyId: req.user!.companyId } },
      select: { id: true },
    });
    if (!existing) throw httpError(404, "Webhook not found");
    await prisma.webhook.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

webhooksRouter.post("/:id/test", requireManager, async (req: AuthedRequest, res, next) => {
  try {
    const hook = await prisma.webhook.findFirst({
      where: { id: req.params.id, project: { companyId: req.user!.companyId } },
    });
    if (!hook) throw httpError(404, "Webhook not found");
    const event = hook.events[0] ?? "run.created";
    dispatchWebhook({
      projectId: hook.projectId,
      event: event as typeof WEBHOOK_EVENTS[number],
      payload: { test: true, triggeredBy: req.user!.id },
    });
    res.json({ ok: true, event });
  } catch (e) {
    next(e);
  }
});
