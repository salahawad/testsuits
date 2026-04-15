import { prisma } from "../db";
import { httpError } from "../middleware/error";
import { logger } from "./logger";

type AdfNode = Record<string, unknown>;
type AdfDoc = { type: "doc"; version: 1; content: AdfNode[] };

export const DEFAULT_SUMMARY_TEMPLATE = "[{{suiteName}}] {{caseTitle}} failed";

export const DEFAULT_DESCRIPTION_TEMPLATE = [
  "Auto-created from TestSuits run: {{runName}}",
  "Project: {{projectName}} ({{projectKey}})",
  "Suite: {{suiteName}}",
  "Test case: {{caseTitle}}",
  "Tester: {{tester}}",
  "Platform: {{platform}}",
  "Connectivity: {{connectivity}}",
  "Locale: {{locale}}",
  "Environment: {{environment}}",
  "",
  "## Preconditions",
  "{{preconditions}}",
  "",
  "## Steps",
  "{{steps}}",
  "",
  "## Failure reason",
  "{{failureReason}}",
  "",
  "## Actual result",
  "{{actualResult}}",
].join("\n");

function textRuns(raw: string): AdfNode[] {
  if (!raw) return [];
  // Bold **x**, italic *x*, inline code `x`. Plain otherwise.
  const out: AdfNode[] = [];
  const pattern = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(raw)) !== null) {
    if (m.index > last) out.push({ type: "text", text: raw.slice(last, m.index) });
    if (m[2] !== undefined) out.push({ type: "text", text: m[2], marks: [{ type: "strong" }] });
    else if (m[3] !== undefined) out.push({ type: "text", text: m[3], marks: [{ type: "em" }] });
    else if (m[4] !== undefined) out.push({ type: "text", text: m[4], marks: [{ type: "code" }] });
    last = m.index + m[0].length;
  }
  if (last < raw.length) out.push({ type: "text", text: raw.slice(last) });
  return out;
}

function paragraph(text: string): AdfNode {
  const runs = textRuns(text);
  return runs.length ? { type: "paragraph", content: runs } : { type: "paragraph" };
}

// Convert a small markdown-like string to Atlassian Document Format so headings
// and lists render natively in Jira Cloud instead of showing "## foo" literally.
// Supports: h1-h6 headings, dash/asterisk bullets, numbered lists, fenced code,
// blank-line paragraph breaks, and inline bold/italic/code marks.
function mdToAdf(text: string): AdfDoc {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const content: AdfNode[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") {
      i++;
      continue;
    }

    // Fenced code block
    if (line.trimStart().startsWith("```")) {
      const lang = line.trim().replace(/^```/, "").trim() || null;
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
        body.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // skip closing fence
      content.push({
        type: "codeBlock",
        attrs: lang ? { language: lang } : {},
        content: [{ type: "text", text: body.join("\n") }],
      });
      continue;
    }

    // Heading
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      const level = Math.min(h[1].length, 6);
      content.push({ type: "heading", attrs: { level }, content: textRuns(h[2]) });
      i++;
      continue;
    }

    // Ordered list (consume contiguous N. items + indented continuation lines)
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: AdfNode[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        const head = lines[i].replace(/^\s*\d+\.\s+/, "");
        const itemLines = [head];
        i++;
        while (i < lines.length && /^\s{2,}\S/.test(lines[i])) {
          itemLines.push(lines[i].trimStart());
          i++;
        }
        items.push({
          type: "listItem",
          content: itemLines.map((l) => paragraph(l)),
        });
      }
      content.push({ type: "orderedList", content: items });
      continue;
    }

    // Bullet list
    if (/^\s*[-*]\s+/.test(line)) {
      const items: AdfNode[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        const head = lines[i].replace(/^\s*[-*]\s+/, "");
        const itemLines = [head];
        i++;
        while (i < lines.length && /^\s{2,}\S/.test(lines[i])) {
          itemLines.push(lines[i].trimStart());
          i++;
        }
        items.push({
          type: "listItem",
          content: itemLines.map((l) => paragraph(l)),
        });
      }
      content.push({ type: "bulletList", content: items });
      continue;
    }

    // Paragraph — consume consecutive non-empty non-special lines as one paragraph
    const paraLines = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^(#{1,6}\s|\s*[-*]\s+|\s*\d+\.\s+|```)/.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    content.push(paragraph(paraLines.join(" ")));
  }

  return { type: "doc", version: 1, content };
}

function basicAuth(email: string, token: string) {
  return "Basic " + Buffer.from(`${email}:${token}`).toString("base64");
}

function render(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => vars[key] ?? "—");
}

export async function jiraFetch<T>(
  config: { baseUrl: string; email: string; apiToken: string },
  path: string,
  init?: RequestInit,
): Promise<T> {
  const url = `${config.baseUrl.replace(/\/$/, "")}${path}`;
  const resp = await fetch(url, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: basicAuth(config.email, config.apiToken),
      Accept: "application/json",
    },
  });
  if (!resp.ok) {
    const text = await resp.text();
    logger.error({ jiraPath: path, status: resp.status }, "jira request failed");
    throw httpError(resp.status, `Jira error (${resp.status}): ${text.slice(0, 500)}`);
  }
  return resp.json() as Promise<T>;
}

export async function createJiraBugForExecution(executionId: string) {
  const execution = await prisma.testExecution.findUnique({
    where: { id: executionId },
    include: {
      case: { include: { suite: { include: { project: { include: { company: { include: { jiraConfig: true } } } } } } } },
      run: true,
      executedBy: { select: { name: true, email: true } },
    },
  });
  if (!execution) throw httpError(404, "Execution not found");
  if (execution.jiraIssueKey) throw httpError(409, `Jira issue already linked: ${execution.jiraIssueKey}`);
  if (execution.status !== "FAILED") throw httpError(400, "Execution must be FAILED to create a Jira bug");

  const project = execution.case.suite.project;
  const config = project.company.jiraConfig;
  if (!config || !config.enabled) throw httpError(400, "Jira integration is not configured for this company");
  if (!project.jiraProjectKey) throw httpError(400, "This project has no Jira target set — configure it in Project settings");

  const stepsText = (execution.case.steps as Array<{ action: string; expected: string }>)
    .map((s, i) => `${i + 1}. ${s.action}\n   *Expected:* ${s.expected}`)
    .join("\n");

  const vars: Record<string, string> = {
    caseTitle: execution.case.title,
    suiteName: execution.case.suite.name,
    projectName: project.name,
    projectKey: project.key,
    runName: execution.run.name,
    environment: execution.run.environment ?? "—",
    platform: execution.run.platform ?? "—",
    connectivity: execution.run.connectivity ?? "—",
    locale: execution.run.locale ?? "—",
    tester: execution.executedBy?.name ?? "unknown",
    preconditions: execution.case.preconditions || "—",
    steps: stepsText || "—",
    failureReason: execution.failureReason || execution.notes || "—",
    actualResult: execution.actualResult || "—",
  };

  const summary = render(config.summaryTemplate ?? DEFAULT_SUMMARY_TEMPLATE, vars).slice(0, 250);
  const description = render(config.descriptionTemplate ?? DEFAULT_DESCRIPTION_TEMPLATE, vars);

  const fields: Record<string, unknown> = {
    project: { key: project.jiraProjectKey },
    summary,
    issuetype: { name: project.jiraIssueType || config.defaultIssueType || "Bug" },
    description: mdToAdf(description),
    labels: ["testsuits", "auto-created"],
  };
  if (project.jiraParentEpicKey) {
    fields.parent = { key: project.jiraParentEpicKey };
  }

  const data = await jiraFetch<{ key: string; self: string }>(
    config,
    "/rest/api/3/issue",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fields }) },
  );

  const issueUrl = `${config.baseUrl.replace(/\/$/, "")}/browse/${data.key}`;
  const updated = await prisma.testExecution.update({
    where: { id: executionId },
    data: { jiraIssueKey: data.key, jiraIssueUrl: issueUrl },
  });

  logger.info(
    { executionId, jiraKey: data.key, jiraProject: project.jiraProjectKey, parentEpic: project.jiraParentEpicKey },
    "jira bug created",
  );

  try {
    const { logActivity } = await import("./activity");
    await logActivity({
      projectId: execution.case.suite.projectId,
      userId: execution.executedById ?? null,
      action: "JIRA_LINKED",
      entityType: "execution",
      entityId: executionId,
      payload: { issueKey: data.key, auto: true, parentEpic: project.jiraParentEpicKey ?? null },
    });
  } catch {}

  return updated;
}
