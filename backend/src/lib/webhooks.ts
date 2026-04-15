import { createHmac } from "crypto";
import { prisma } from "../db";
import { logger } from "./logger";

export const WEBHOOK_EVENTS = [
  "run.created",
  "run.completed",
  "execution.failed",
  "execution.passed",
  "jira.bug_created",
] as const;
export type WebhookEvent = typeof WEBHOOK_EVENTS[number];

type DispatchInput = {
  projectId: string;
  event: WebhookEvent;
  payload: Record<string, unknown>;
};

/**
 * Fire-and-forget webhook dispatch. Each matching webhook gets a POST with the
 * event body; the response is recorded in WebhookDelivery. Errors are logged
 * but never surfaced to the caller — this must not block the mutation that
 * triggered the event.
 */
export function dispatchWebhook(input: DispatchInput): void {
  void (async () => {
    try {
      const hooks = await prisma.webhook.findMany({
        where: {
          projectId: input.projectId,
          active: true,
          events: { has: input.event },
        },
      });
      if (hooks.length === 0) return;
      await Promise.all(hooks.map((hook) => deliver(hook, input)));
    } catch (err) {
      logger.error({ err, event: input.event, projectId: input.projectId }, "webhook dispatch failed");
    }
  })();
}

async function deliver(
  hook: { id: string; url: string; secret: string | null },
  input: DispatchInput,
) {
  const body = JSON.stringify({
    event: input.event,
    projectId: input.projectId,
    deliveredAt: new Date().toISOString(),
    data: input.payload,
  });
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "user-agent": "testsuits-webhook/1",
    "x-testsuits-event": input.event,
    "x-testsuits-webhook-id": hook.id,
  };
  if (hook.secret) {
    headers["x-testsuits-signature"] = createHmac("sha256", hook.secret).update(body).digest("hex");
  }
  let status: number | null = null;
  let error: string | null = null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(hook.url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));
    status = res.status;
    if (!res.ok) {
      error = `HTTP ${res.status}`;
      logger.warn({ hookId: hook.id, event: input.event, status: res.status }, "webhook non-2xx");
    } else {
      logger.info({ hookId: hook.id, event: input.event, status: res.status }, "webhook delivered");
    }
  } catch (err) {
    error = err instanceof Error ? err.message.slice(0, 500) : "unknown error";
    logger.error({ err, hookId: hook.id, event: input.event }, "webhook delivery failed");
  }
  try {
    await prisma.webhookDelivery.create({
      data: { webhookId: hook.id, event: input.event, status, error },
    });
  } catch (err) {
    logger.error({ err, hookId: hook.id }, "webhook delivery log write failed");
  }
}
