import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { app } from "../app";
import { resetDb, disconnect } from "./helpers/db";
import { seedBaseline, createProject, createSuite, createCase } from "./helpers/factories";

beforeAll(async () => { await resetDb(); });
afterAll(async () => { await disconnect(); });
beforeEach(async () => { await resetDb(); });

describe("POST /api/requirements", () => {
  it("manager creates a requirement", async () => {
    const { manager, company } = await seedBaseline();
    const p = await createProject({ companyId: company.id });
    const res = await request(app)
      .post("/api/requirements")
      .set("Authorization", `Bearer ${manager.token}`)
      .send({ projectId: p.id, externalRef: "REQ-1", title: "Login works" });
    expect(res.status).toBe(201);
    expect(res.body.externalRef).toBe("REQ-1");
  });

  it("rejects duplicate externalRef within a project (EXTERNAL_REF_DUPLICATE)", async () => {
    const { manager, company } = await seedBaseline();
    const p = await createProject({ companyId: company.id });
    await request(app).post("/api/requirements").set("Authorization", `Bearer ${manager.token}`)
      .send({ projectId: p.id, externalRef: "REQ-1", title: "first" });
    const res = await request(app).post("/api/requirements").set("Authorization", `Bearer ${manager.token}`)
      .send({ projectId: p.id, externalRef: "REQ-1", title: "second" });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("EXTERNAL_REF_DUPLICATE");
  });

  it("tester cannot create a requirement", async () => {
    const { tester, company } = await seedBaseline();
    const p = await createProject({ companyId: company.id });
    const res = await request(app)
      .post("/api/requirements")
      .set("Authorization", `Bearer ${tester.token}`)
      .send({ projectId: p.id, externalRef: "R-1", title: "T" });
    expect(res.status).toBe(403);
  });
});

describe("GET /api/requirements", () => {
  it("lists requirements for a project; 400 without projectId", async () => {
    const { manager, company } = await seedBaseline();
    const p = await createProject({ companyId: company.id });
    await request(app).post("/api/requirements").set("Authorization", `Bearer ${manager.token}`)
      .send({ projectId: p.id, externalRef: "R-1", title: "T" });

    const ok = await request(app).get(`/api/requirements?projectId=${p.id}`).set("Authorization", `Bearer ${manager.token}`);
    expect(ok.body).toHaveLength(1);

    const missing = await request(app).get("/api/requirements").set("Authorization", `Bearer ${manager.token}`);
    expect(missing.status).toBe(400);
    expect(missing.body.error).toBe("PROJECT_ID_REQUIRED");
  });
});

describe("Requirement <-> case linking", () => {
  it("link and unlink a case via /:id/cases", async () => {
    const { manager, company } = await seedBaseline();
    const p = await createProject({ companyId: company.id });
    const s = await createSuite({ projectId: p.id });
    const c = await createCase({ suiteId: s.id });
    const r = await request(app).post("/api/requirements").set("Authorization", `Bearer ${manager.token}`)
      .send({ projectId: p.id, externalRef: "R-1", title: "T" });

    const link = await request(app).post(`/api/requirements/${r.body.id}/cases`).set("Authorization", `Bearer ${manager.token}`)
      .send({ caseId: c.id });
    expect(link.status).toBe(204);

    const detail = await request(app).get(`/api/requirements/${r.body.id}`).set("Authorization", `Bearer ${manager.token}`);
    expect(detail.body.cases.map((k: any) => k.id)).toContain(c.id);

    const unlink = await request(app).delete(`/api/requirements/${r.body.id}/cases/${c.id}`).set("Authorization", `Bearer ${manager.token}`);
    expect(unlink.status).toBe(204);

    const detail2 = await request(app).get(`/api/requirements/${r.body.id}`).set("Authorization", `Bearer ${manager.token}`);
    expect(detail2.body.cases).toHaveLength(0);
  });

  it("rejects linking a case from another project (CASE_NOT_FOUND_IN_PROJECT)", async () => {
    const { manager, company } = await seedBaseline();
    const p1 = await createProject({ companyId: company.id, key: "P1" });
    const p2 = await createProject({ companyId: company.id, key: "P2" });
    const s = await createSuite({ projectId: p2.id });
    const c = await createCase({ suiteId: s.id });
    const r = await request(app).post("/api/requirements").set("Authorization", `Bearer ${manager.token}`)
      .send({ projectId: p1.id, externalRef: "R-1", title: "T" });

    const res = await request(app).post(`/api/requirements/${r.body.id}/cases`).set("Authorization", `Bearer ${manager.token}`)
      .send({ caseId: c.id });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("CASE_NOT_FOUND_IN_PROJECT");
  });
});

describe("PATCH/DELETE /api/requirements/:id", () => {
  it("updates and deletes a requirement", async () => {
    const { manager, company } = await seedBaseline();
    const p = await createProject({ companyId: company.id });
    const r = await request(app).post("/api/requirements").set("Authorization", `Bearer ${manager.token}`)
      .send({ projectId: p.id, externalRef: "R-1", title: "T" });

    const patch = await request(app).patch(`/api/requirements/${r.body.id}`).set("Authorization", `Bearer ${manager.token}`)
      .send({ title: "Updated" });
    expect(patch.status).toBe(200);
    expect(patch.body.title).toBe("Updated");

    const del = await request(app).delete(`/api/requirements/${r.body.id}`).set("Authorization", `Bearer ${manager.token}`);
    expect(del.status).toBe(204);
  });
});
