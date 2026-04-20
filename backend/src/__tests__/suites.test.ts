import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { app } from "../app";
import { prisma } from "../db";
import { resetDb, disconnect } from "./helpers/db";
import { seedBaseline, createProject, createSuite, createCase } from "./helpers/factories";

beforeAll(async () => { await resetDb(); });
afterAll(async () => { await disconnect(); });
beforeEach(async () => { await resetDb(); });

describe("POST /api/suites", () => {
  it("manager creates a suite under a project", async () => {
    const { manager, company } = await seedBaseline();
    const p = await createProject({ companyId: company.id });
    const res = await request(app)
      .post("/api/suites")
      .set("Authorization", `Bearer ${manager.token}`)
      .send({ projectId: p.id, name: "Cart", description: "Cart suite" });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Cart");
  });

  it("rejects suite creation for a project in another company", async () => {
    const { manager, otherCompany } = await seedBaseline();
    const p = await createProject({ companyId: otherCompany.id });
    const res = await request(app)
      .post("/api/suites")
      .set("Authorization", `Bearer ${manager.token}`)
      .send({ projectId: p.id, name: "X" });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("PROJECT_NOT_FOUND");
  });

  it("tester cannot create a suite", async () => {
    const { tester, company } = await seedBaseline();
    const p = await createProject({ companyId: company.id });
    const res = await request(app)
      .post("/api/suites")
      .set("Authorization", `Bearer ${tester.token}`)
      .send({ projectId: p.id, name: "X" });
    expect(res.status).toBe(403);
  });

  it("supports nested suites via parentId", async () => {
    const { manager, company } = await seedBaseline();
    const p = await createProject({ companyId: company.id });
    const parent = await createSuite({ projectId: p.id, name: "Parent" });
    const res = await request(app)
      .post("/api/suites")
      .set("Authorization", `Bearer ${manager.token}`)
      .send({ projectId: p.id, parentId: parent.id, name: "Child" });
    expect(res.status).toBe(201);
    expect(res.body.parentId).toBe(parent.id);
  });
});

describe("GET /api/suites/:id", () => {
  it("returns the suite with cases and children for owners", async () => {
    const { manager, company } = await seedBaseline();
    const p = await createProject({ companyId: company.id });
    const s = await createSuite({ projectId: p.id });
    await createCase({ suiteId: s.id, title: "case one" });

    const res = await request(app).get(`/api/suites/${s.id}`).set("Authorization", `Bearer ${manager.token}`);
    expect(res.status).toBe(200);
    expect(res.body.cases).toHaveLength(1);
    expect(res.body.cases[0].title).toBe("case one");
  });

  it("returns 404 for a suite in another company", async () => {
    const { manager, otherCompany } = await seedBaseline();
    const p = await createProject({ companyId: otherCompany.id });
    const s = await createSuite({ projectId: p.id });
    const res = await request(app).get(`/api/suites/${s.id}`).set("Authorization", `Bearer ${manager.token}`);
    expect(res.status).toBe(404);
  });
});

describe("PATCH/DELETE /api/suites/:id", () => {
  it("manager updates and deletes a suite", async () => {
    const { manager, company } = await seedBaseline();
    const p = await createProject({ companyId: company.id });
    const s = await createSuite({ projectId: p.id, name: "Old" });

    const patch = await request(app)
      .patch(`/api/suites/${s.id}`)
      .set("Authorization", `Bearer ${manager.token}`)
      .send({ name: "New" });
    expect(patch.status).toBe(200);
    expect(patch.body.name).toBe("New");

    const del = await request(app).delete(`/api/suites/${s.id}`).set("Authorization", `Bearer ${manager.token}`);
    expect(del.status).toBe(204);
    expect(await prisma.testSuite.findUnique({ where: { id: s.id } })).toBeNull();
  });

  it("viewer cannot patch a suite", async () => {
    const { viewer, company } = await seedBaseline();
    const p = await createProject({ companyId: company.id });
    const s = await createSuite({ projectId: p.id });
    const res = await request(app)
      .patch(`/api/suites/${s.id}`)
      .set("Authorization", `Bearer ${viewer.token}`)
      .send({ name: "X" });
    expect(res.status).toBe(403);
  });
});
