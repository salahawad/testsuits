import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { AuthedRequest, requireManager, requireWrite } from "../middleware/auth";
import { httpError } from "../middleware/error";
import {
  createJiraBugForExecution,
  jiraFetch,
  DEFAULT_SUMMARY_TEMPLATE,
  DEFAULT_DESCRIPTION_TEMPLATE,
} from "../lib/jira";
import { executionWhere, projectWhere } from "../middleware/scope";
import { logger } from "../lib/logger";
import { dispatchWebhook } from "../lib/webhooks";

export const jiraRouter = Router();

// ---- Company-wide credentials & templates --------------------------------

const companyConfigSchema = z.object({
  baseUrl: z.string().url(),
  email: z.string().email(),
  apiToken: z.string().optional(),
  defaultIssueType: z.string().optional(),
  summaryTemplate: z.string().optional().nullable(),
  descriptionTemplate: z.string().optional().nullable(),
  enabled: z.boolean().optional(),
});

function sanitize(config: Awaited<ReturnType<typeof prisma.jiraConfig.findUnique>>) {
  if (!config) return null;
  const { apiToken, ...safe } = config;
  return { ...safe, hasToken: !!apiToken };
}

jiraRouter.get("/config", async (req: AuthedRequest, res, next) => {
  try {
    const config = await prisma.jiraConfig.findUnique({ where: { companyId: req.user!.companyId } });
    res.json(sanitize(config) ?? null);
  } catch (e) {
    next(e);
  }
});

jiraRouter.put("/config", requireManager, async (req: AuthedRequest, res, next) => {
  try {
    const data = companyConfigSchema.parse(req.body);
    const existing = await prisma.jiraConfig.findUnique({ where: { companyId: req.user!.companyId } });
    const apiToken = data.apiToken?.trim() ? data.apiToken : existing?.apiToken;
    if (!apiToken) throw httpError(400, "API token is required on first configuration");
    const config = await prisma.jiraConfig.upsert({
      where: { companyId: req.user!.companyId },
      update: { ...data, apiToken },
      create: { companyId: req.user!.companyId, ...data, apiToken },
    });
    logger.info({ companyId: req.user!.companyId, enabled: config.enabled }, "jira company config saved");
    res.json(sanitize(config));
  } catch (e) {
    next(e);
  }
});

jiraRouter.delete("/config", requireManager, async (req: AuthedRequest, res, next) => {
  try {
    await prisma.jiraConfig.delete({ where: { companyId: req.user!.companyId } });
    logger.info({ companyId: req.user!.companyId }, "jira company config removed");
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

jiraRouter.post("/test", async (req: AuthedRequest, res, next) => {
  try {
    const config = await prisma.jiraConfig.findUnique({ where: { companyId: req.user!.companyId } });
    if (!config) throw httpError(404, "No Jira config for this company");
    const me = await jiraFetch<{ displayName: string; emailAddress: string }>(config, "/rest/api/3/myself");
    res.json({ ok: true, connectedAs: me.displayName, email: me.emailAddress });
  } catch (e) {
    next(e);
  }
});

// ---- Discovery (company credentials) -------------------------------------

async function companyConfig(companyId: string) {
  const config = await prisma.jiraConfig.findUnique({ where: { companyId } });
  if (!config) throw httpError(404, "No Jira config for this company");
  return config;
}

jiraRouter.get("/discover/projects", async (req: AuthedRequest, res, next) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q : "";
    const config = await companyConfig(req.user!.companyId);
    const data = await jiraFetch<{ values: Array<{ key: string; name: string; id: string }> }>(
      config,
      `/rest/api/3/project/search?maxResults=50&orderBy=name${q ? `&query=${encodeURIComponent(q)}` : ""}`,
    );
    res.json(data.values.map((p) => ({ key: p.key, name: p.name, id: p.id })));
  } catch (e) {
    next(e);
  }
});

jiraRouter.get("/discover/issue-types", async (req: AuthedRequest, res, next) => {
  try {
    const projectKey = typeof req.query.projectKey === "string" ? req.query.projectKey : undefined;
    if (!projectKey) throw httpError(400, "projectKey required");
    const config = await companyConfig(req.user!.companyId);
    const project = await jiraFetch<{ issueTypes?: Array<{ name: string; subtask: boolean }> }>(
      config,
      `/rest/api/3/project/${encodeURIComponent(projectKey)}`,
    );
    res.json((project.issueTypes ?? []).filter((t) => !t.subtask).map((t) => t.name));
  } catch (e) {
    next(e);
  }
});

jiraRouter.get("/discover/epics", async (req: AuthedRequest, res, next) => {
  try {
    const projectKey = typeof req.query.projectKey === "string" ? req.query.projectKey : undefined;
    if (!projectKey) throw httpError(400, "projectKey required");
    const q = typeof req.query.q === "string" ? req.query.q : "";
    const config = await companyConfig(req.user!.companyId);
    const jql = `project = "${projectKey}" AND issuetype = Epic${q ? ` AND summary ~ "${q.replace(/"/g, "")}"` : ""} ORDER BY created DESC`;
    const data = await jiraFetch<{ issues: Array<{ key: string; fields: { summary: string; status?: { name: string } } }> }>(
      config,
      `/rest/api/3/search?jql=${encodeURIComponent(jql)}&fields=summary,status&maxResults=50`,
    );
    res.json(
      data.issues.map((i) => ({
        key: i.key,
        summary: i.fields.summary,
        status: i.fields.status?.name ?? null,
      })),
    );
  } catch (e) {
    next(e);
  }
});

jiraRouter.get("/defaults/templates", (_req, res) => {
  res.json({ summary: DEFAULT_SUMMARY_TEMPLATE, description: DEFAULT_DESCRIPTION_TEMPLATE });
});

// ---- Per-project Jira target --------------------------------------------

const projectBindingSchema = z.object({
  jiraProjectKey: z.string().optional().nullable(),
  jiraProjectName: z.string().optional().nullable(),
  jiraIssueType: z.string().optional().nullable(),
  jiraParentEpicKey: z.string().optional().nullable(),
  jiraParentEpicSummary: z.string().optional().nullable(),
});

jiraRouter.get("/projects/:projectId/binding", async (req: AuthedRequest, res, next) => {
  try {
    const project = await prisma.project.findFirst({
      where: projectWhere(req.user!, { id: req.params.projectId }),
      select: {
        id: true,
        name: true,
        key: true,
        jiraProjectKey: true,
        jiraProjectName: true,
        jiraIssueType: true,
        jiraParentEpicKey: true,
        jiraParentEpicSummary: true,
      },
    });
    if (!project) throw httpError(404, "Project not found");
    res.json(project);
  } catch (e) {
    next(e);
  }
});

jiraRouter.put("/projects/:projectId/binding", requireManager, async (req: AuthedRequest, res, next) => {
  try {
    const data = projectBindingSchema.parse(req.body);
    const owned = await prisma.project.findFirst({
      where: projectWhere(req.user!, { id: req.params.projectId }),
      select: { id: true },
    });
    if (!owned) throw httpError(404, "Project not found");
    const project = await prisma.project.update({
      where: { id: req.params.projectId },
      data,
      select: {
        id: true,
        name: true,
        key: true,
        jiraProjectKey: true,
        jiraProjectName: true,
        jiraIssueType: true,
        jiraParentEpicKey: true,
        jiraParentEpicSummary: true,
      },
    });
    logger.info(
      {
        projectId: project.id,
        jiraProjectKey: project.jiraProjectKey,
        parentEpic: project.jiraParentEpicKey,
        updatedBy: req.user!.id,
      },
      "project jira binding saved",
    );
    res.json(project);
  } catch (e) {
    next(e);
  }
});

// ---- Bug creation / linking — scoped to caller's company -----------------

async function assertAccessToExecution(req: AuthedRequest, id: string) {
  const allowed = await prisma.testExecution.findFirst({
    where: executionWhere(req.user!, { id }),
    select: { id: true },
  });
  if (!allowed) throw httpError(404, "Execution not found");
}

jiraRouter.post("/executions/:id/create-bug", requireWrite, async (req: AuthedRequest, res, next) => {
  try {
    await assertAccessToExecution(req, req.params.id);
    const updated = await createJiraBugForExecution(req.params.id);
    const exec = await prisma.testExecution.findUnique({
      where: { id: req.params.id },
      select: { runId: true, caseId: true, run: { select: { projectId: true } } },
    });
    if (exec) {
      dispatchWebhook({
        projectId: exec.run.projectId,
        event: "jira.bug_created",
        payload: {
          executionId: req.params.id,
          runId: exec.runId,
          caseId: exec.caseId,
          jiraIssueKey: updated.jiraIssueKey,
          jiraIssueUrl: updated.jiraIssueUrl,
          createdBy: req.user!.id,
        },
      });
    }
    res.json({ jiraIssueKey: updated.jiraIssueKey, jiraIssueUrl: updated.jiraIssueUrl });
  } catch (e) {
    next(e);
  }
});

const linkSchema = z.object({ jiraIssueKey: z.string().min(1) });

jiraRouter.post("/executions/:id/link", requireWrite, async (req: AuthedRequest, res, next) => {
  try {
    await assertAccessToExecution(req, req.params.id);
    const { jiraIssueKey } = linkSchema.parse(req.body);
    const config = await prisma.jiraConfig.findUnique({ where: { companyId: req.user!.companyId } });
    const base = config?.baseUrl.replace(/\/$/, "") ?? "";
    const url = base ? `${base}/browse/${jiraIssueKey}` : "";
    const updated = await prisma.testExecution.update({
      where: { id: req.params.id },
      data: { jiraIssueKey, jiraIssueUrl: url },
    });
    logger.info({ executionId: req.params.id, jiraIssueKey }, "jira issue linked manually");
    res.json({ jiraIssueKey: updated.jiraIssueKey, jiraIssueUrl: updated.jiraIssueUrl });
  } catch (e) {
    next(e);
  }
});

jiraRouter.post("/executions/:id/unlink", requireWrite, async (req: AuthedRequest, res, next) => {
  try {
    await assertAccessToExecution(req, req.params.id);
    const updated = await prisma.testExecution.update({
      where: { id: req.params.id },
      data: { jiraIssueKey: null, jiraIssueUrl: null },
    });
    res.json(updated);
  } catch (e) {
    next(e);
  }
});
