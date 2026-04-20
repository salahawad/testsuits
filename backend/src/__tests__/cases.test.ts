import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { app } from "../app";
import { prisma } from "../db";
import { resetDb, disconnect } from "./helpers/db";
import { seedBaseline, createProject, createSuite, createCase } from "./helpers/factories";

beforeAll(async () => { await resetDb(); });
afterAll(async () => { await disconnect(); });
beforeEach(async () => { await resetDb(); });

async function projectWithSuite(companyId: string) {
  const project = await createProject({ companyId });
  const suite = await createSuite({ projectId: project.id });
  return { project, suite };
}

describe("POST /api/cases", () => {
  it("manager creates a case", async () => {
    const { manager, company } = await seedBaseline();
    const { suite } = await projectWithSuite(company.id);
    const res = await request(app)
      .post("/api/cases")
      .set("Authorization", `Bearer ${manager.token}`)
      .send({
        suiteId: suite.id,
        title: "Login works",
        priority: "HIGH",
        steps: [{ action: "open /login", expected: "form shown" }],
      });
    expect(res.status).toBe(201);
    expect(res.body.title).toBe("Login works");
    expect(res.body.priority).toBe("HIGH");
  });

  it("rejects empty title (zod)", async () => {
    const { manager, company } = await seedBaseline();
    const { suite } = await projectWithSuite(company.id);
    const res = await request(app)
      .post("/api/cases")
      .set("Authorization", `Bearer ${manager.token}`)
      .send({ suiteId: suite.id, title: "   ", priority: "LOW" });
    expect(res.status).toBe(400);
  });

  it("rejects case for a suite in another company", async () => {
    const { manager, otherCompany } = await seedBaseline();
    const { suite } = await projectWithSuite(otherCompany.id);
    const res = await request(app)
      .post("/api/cases")
      .set("Authorization", `Bearer ${manager.token}`)
      .send({ suiteId: suite.id, title: "X", priority: "LOW" });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("SUITE_NOT_FOUND");
  });

  it("tester cannot create a case", async () => {
    const { tester, company } = await seedBaseline();
    const { suite } = await projectWithSuite(company.id);
    const res = await request(app)
      .post("/api/cases")
      .set("Authorization", `Bearer ${tester.token}`)
      .send({ suiteId: suite.id, title: "X", priority: "LOW" });
    expect(res.status).toBe(403);
  });
});

describe("GET /api/cases/:id", () => {
  it("returns the case with suite + project context", async () => {
    const { manager, company } = await seedBaseline();
    const { suite, project } = await projectWithSuite(company.id);
    const c = await createCase({ suiteId: suite.id, title: "Read me" });
    const res = await request(app).get(`/api/cases/${c.id}`).set("Authorization", `Bearer ${manager.token}`);
    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Read me");
    expect(res.body.suite.project.id).toBe(project.id);
  });

  it("returns 404 for a cross-tenant case", async () => {
    const { manager, otherCompany } = await seedBaseline();
    const { suite } = await projectWithSuite(otherCompany.id);
    const c = await createCase({ suiteId: suite.id });
    const res = await request(app).get(`/api/cases/${c.id}`).set("Authorization", `Bearer ${manager.token}`);
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/cases/:id", () => {
  it("manager updates a case and a revision is snapshotted", async () => {
    const { manager, company } = await seedBaseline();
    const { suite } = await projectWithSuite(company.id);
    const c = await createCase({ suiteId: suite.id, title: "v1" });

    const res = await request(app)
      .patch(`/api/cases/${c.id}`)
      .set("Authorization", `Bearer ${manager.token}`)
      .send({ title: "v2", priority: "CRITICAL" });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe("v2");
    expect(res.body.priority).toBe("CRITICAL");

    const revs = await prisma.testCaseRevision.findMany({ where: { caseId: c.id } });
    expect(revs).toHaveLength(1);
    expect(revs[0].title).toBe("v1");
    expect(revs[0].version).toBe(1);
  });

  it("GET /revisions lists history with author info", async () => {
    const { manager, company } = await seedBaseline();
    const { suite } = await projectWithSuite(company.id);
    const c = await createCase({ suiteId: suite.id, title: "v1" });
    await request(app).patch(`/api/cases/${c.id}`).set("Authorization", `Bearer ${manager.token}`).send({ title: "v2" });
    await request(app).patch(`/api/cases/${c.id}`).set("Authorization", `Bearer ${manager.token}`).send({ title: "v3" });

    const res = await request(app).get(`/api/cases/${c.id}/revisions`).set("Authorization", `Bearer ${manager.token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].version).toBe(2);
    expect(res.body[0].author.name).toBe("Manager");
  });
});

describe("POST /api/cases/:id/clone", () => {
  it("clones a case into the same suite by default", async () => {
    const { manager, company } = await seedBaseline();
    const { suite } = await projectWithSuite(company.id);
    const c = await createCase({ suiteId: suite.id, title: "Original" });

    const res = await request(app)
      .post(`/api/cases/${c.id}/clone`)
      .set("Authorization", `Bearer ${manager.token}`)
      .send({});
    expect(res.status).toBe(201);
    expect(res.body.title).toBe("Original (copy)");
    expect(res.body.cloneOfId).toBe(c.id);
    expect(res.body.suiteId).toBe(suite.id);
  });

  it("clones into a different suite when suiteId is given", async () => {
    const { manager, company } = await seedBaseline();
    const { suite: s1, project } = await projectWithSuite(company.id);
    const s2 = await createSuite({ projectId: project.id, name: "Other" });
    const c = await createCase({ suiteId: s1.id });

    const res = await request(app)
      .post(`/api/cases/${c.id}/clone`)
      .set("Authorization", `Bearer ${manager.token}`)
      .send({ suiteId: s2.id });
    expect(res.status).toBe(201);
    expect(res.body.suiteId).toBe(s2.id);
  });
});

describe("DELETE /api/cases/:id", () => {
  it("deletes a case", async () => {
    const { manager, company } = await seedBaseline();
    const { suite } = await projectWithSuite(company.id);
    const c = await createCase({ suiteId: suite.id });
    const res = await request(app).delete(`/api/cases/${c.id}`).set("Authorization", `Bearer ${manager.token}`);
    expect(res.status).toBe(204);
    expect(await prisma.testCase.findUnique({ where: { id: c.id } })).toBeNull();
  });
});
