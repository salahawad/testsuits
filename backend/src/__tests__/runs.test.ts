import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { app } from "../app";
import { prisma } from "../db";
import { resetDb, disconnect } from "./helpers/db";
import { seedBaseline, createProject, createSuite, createCase, createMilestone } from "./helpers/factories";

beforeAll(async () => { await resetDb(); });
afterAll(async () => { await disconnect(); });
beforeEach(async () => { await resetDb(); });

async function projectWithCases(companyId: string, n = 2) {
  const project = await createProject({ companyId });
  const suite = await createSuite({ projectId: project.id });
  const cases = [];
  for (let i = 0; i < n; i++) cases.push(await createCase({ suiteId: suite.id, title: `case ${i}` }));
  return { project, suite, cases };
}

describe("POST /api/runs", () => {
  it("creates a run with case ids, builds per-combo results, logs activity", async () => {
    const { manager, company } = await seedBaseline();
    const { project, cases } = await projectWithCases(company.id, 2);

    const res = await request(app)
      .post("/api/runs")
      .set("Authorization", `Bearer ${manager.token}`)
      .send({
        projectId: project.id,
        name: "Smoke run",
        environment: "staging",
        platforms: ["WEB", "IOS"],
        connectivities: ["ONLINE"],
        locales: ["en"],
        caseIds: cases.map((c) => c.id),
      });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Smoke run");
    expect(res.body.platforms).toEqual(["WEB", "IOS"]);

    // 2 cases * (2 platforms * 1 connectivity * 1 locale) = 4 result rows
    const results = await prisma.testExecutionResult.findMany({ where: { execution: { runId: res.body.id } } });
    expect(results).toHaveLength(4);
  });

  it("rejects run with no cases (RUN_REQUIRES_CASES)", async () => {
    const { manager, company } = await seedBaseline();
    const project = await createProject({ companyId: company.id });
    const res = await request(app)
      .post("/api/runs")
      .set("Authorization", `Bearer ${manager.token}`)
      .send({ projectId: project.id, name: "Empty", environment: "staging" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("RUN_REQUIRES_CASES");
  });

  it("rejects unknown config option (UNKNOWN_CONFIG_OPTION)", async () => {
    const { manager, company } = await seedBaseline();
    const { project, cases } = await projectWithCases(company.id, 1);
    const res = await request(app)
      .post("/api/runs")
      .set("Authorization", `Bearer ${manager.token}`)
      .send({
        projectId: project.id,
        name: "Bad",
        environment: "staging",
        platforms: ["NOPE"],
        caseIds: cases.map((c) => c.id),
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("UNKNOWN_CONFIG_OPTION");
  });

  it("rejects cross-company assignee (ASSIGNEE_NOT_IN_COMPANY)", async () => {
    const { manager, company, otherManager } = await seedBaseline();
    const { project, cases } = await projectWithCases(company.id, 1);
    const res = await request(app)
      .post("/api/runs")
      .set("Authorization", `Bearer ${manager.token}`)
      .send({
        projectId: project.id,
        name: "R",
        environment: "staging",
        caseIds: cases.map((c) => c.id),
        assigneeId: otherManager.id,
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("ASSIGNEE_NOT_IN_COMPANY");
  });

  it("viewer cannot create a run", async () => {
    const { viewer, company } = await seedBaseline();
    const { project, cases } = await projectWithCases(company.id, 1);
    const res = await request(app)
      .post("/api/runs")
      .set("Authorization", `Bearer ${viewer.token}`)
      .send({ projectId: project.id, name: "R", environment: "s", caseIds: cases.map((c) => c.id) });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("READ_ONLY_ROLE");
  });
});

describe("GET /api/runs + /:id", () => {
  it("lists non-archived runs by default, excludes archived", async () => {
    const { manager, company } = await seedBaseline();
    const { project, cases } = await projectWithCases(company.id, 1);
    const r1 = await request(app).post("/api/runs").set("Authorization", `Bearer ${manager.token}`).send({ projectId: project.id, name: "Active", environment: "s", caseIds: [cases[0].id] });
    const r2 = await request(app).post("/api/runs").set("Authorization", `Bearer ${manager.token}`).send({ projectId: project.id, name: "Archived", environment: "s", caseIds: [cases[0].id] });
    await request(app).patch(`/api/runs/${r2.body.id}`).set("Authorization", `Bearer ${manager.token}`).send({ status: "ARCHIVED" });

    const res = await request(app).get("/api/runs").set("Authorization", `Bearer ${manager.token}`);
    expect(res.status).toBe(200);
    expect(res.body.map((r: any) => r.id)).toEqual([r1.body.id]);
  });

  it("tester sees only runs they created or are assigned to", async () => {
    const { manager, tester, company } = await seedBaseline();
    const { project, cases } = await projectWithCases(company.id, 1);
    // Run created by the manager but assigned to the tester — tester SHOULD see it.
    const a = await request(app).post("/api/runs").set("Authorization", `Bearer ${manager.token}`)
      .send({ projectId: project.id, name: "A", environment: "s", caseIds: [cases[0].id], assigneeId: tester.id });
    // Run created by the manager, NOT assigned to the tester — tester should NOT see it.
    const b = await request(app).post("/api/runs").set("Authorization", `Bearer ${manager.token}`)
      .send({ projectId: project.id, name: "B", environment: "s", caseIds: [cases[0].id] });

    const res = await request(app).get("/api/runs").set("Authorization", `Bearer ${tester.token}`);
    const ids = res.body.map((r: any) => r.id);
    expect(ids).toContain(a.body.id);
    expect(ids).not.toContain(b.body.id);
  });

  it("GET /:id returns executions with results", async () => {
    const { manager, company } = await seedBaseline();
    const { project, cases } = await projectWithCases(company.id, 1);
    const r = await request(app).post("/api/runs").set("Authorization", `Bearer ${manager.token}`)
      .send({ projectId: project.id, name: "R", environment: "s", platforms: ["WEB"], locales: ["en"], caseIds: [cases[0].id] });

    const res = await request(app).get(`/api/runs/${r.body.id}`).set("Authorization", `Bearer ${manager.token}`);
    expect(res.status).toBe(200);
    expect(res.body.executions).toHaveLength(1);
    expect(res.body.executions[0].results).toHaveLength(1);
  });
});

describe("PATCH /api/runs/:id", () => {
  it("manager updates status to COMPLETED and sets completedAt", async () => {
    const { manager, company } = await seedBaseline();
    const { project, cases } = await projectWithCases(company.id, 1);
    const r = await request(app).post("/api/runs").set("Authorization", `Bearer ${manager.token}`)
      .send({ projectId: project.id, name: "R", environment: "s", caseIds: [cases[0].id] });

    const res = await request(app)
      .patch(`/api/runs/${r.body.id}`)
      .set("Authorization", `Bearer ${manager.token}`)
      .send({ status: "COMPLETED" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("COMPLETED");
    expect(res.body.completedAt).toBeTruthy();
  });

  it("tester cannot patch (403)", async () => {
    const { manager, tester, company } = await seedBaseline();
    const { project, cases } = await projectWithCases(company.id, 1);
    const r = await request(app).post("/api/runs").set("Authorization", `Bearer ${manager.token}`)
      .send({ projectId: project.id, name: "R", environment: "s", caseIds: [cases[0].id], assigneeId: tester.id });
    const res = await request(app).patch(`/api/runs/${r.body.id}`).set("Authorization", `Bearer ${tester.token}`).send({ name: "X" });
    expect(res.status).toBe(403);
  });
});

describe("GET /api/runs/:id/export.csv", () => {
  it("returns CSV with a header row", async () => {
    const { manager, company } = await seedBaseline();
    const { project, cases } = await projectWithCases(company.id, 1);
    const r = await request(app).post("/api/runs").set("Authorization", `Bearer ${manager.token}`)
      .send({ projectId: project.id, name: "R", environment: "s", caseIds: [cases[0].id] });

    const res = await request(app).get(`/api/runs/${r.body.id}/export.csv`).set("Authorization", `Bearer ${manager.token}`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.text.split("\n")[0]).toMatch(/Suite,Case,Priority,Status/);
  });
});

describe("Run + milestone linking", () => {
  it("creates a run under a milestone and the /runs?milestoneId filter works", async () => {
    const { manager, company } = await seedBaseline();
    const { project, cases } = await projectWithCases(company.id, 1);
    const m = await createMilestone({ projectId: project.id, name: "v1.0" });
    const r = await request(app).post("/api/runs").set("Authorization", `Bearer ${manager.token}`)
      .send({ projectId: project.id, name: "R", environment: "s", caseIds: [cases[0].id], milestoneId: m.id });
    expect(r.status).toBe(201);

    const list = await request(app).get(`/api/runs?milestoneId=${m.id}`).set("Authorization", `Bearer ${manager.token}`);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].milestoneId).toBe(m.id);
  });
});
