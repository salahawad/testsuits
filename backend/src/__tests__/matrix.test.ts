import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { app } from "../app";
import { resetDb, disconnect } from "./helpers/db";
import { seedBaseline, createProject, createSuite, createCase } from "./helpers/factories";

beforeAll(async () => { await resetDb(); });
afterAll(async () => { await disconnect(); });
beforeEach(async () => { await resetDb(); });

describe("GET /api/matrix/projects/:projectId", () => {
  it("returns a dimension matrix with buckets + rows", async () => {
    const { manager, company } = await seedBaseline();
    const p = await createProject({ companyId: company.id });
    const s = await createSuite({ projectId: p.id });
    const c = await createCase({ suiteId: s.id, title: "one" });

    // Create a run with platforms so the matrix has buckets to render.
    const run = await request(app).post("/api/runs").set("Authorization", `Bearer ${manager.token}`)
      .send({ projectId: p.id, name: "R", environment: "s", platforms: ["WEB", "IOS"], caseIds: [c.id] });
    expect(run.status).toBe(201);

    // Mark one per-combo result PASSED so the matrix has something to display.
    const detail = await request(app).get(`/api/runs/${run.body.id}`).set("Authorization", `Bearer ${manager.token}`);
    const firstResult = detail.body.executions[0].results[0];
    await request(app)
      .patch(`/api/execution-results/${firstResult.id}`)
      .set("Authorization", `Bearer ${manager.token}`)
      .send({ status: "PASSED" });

    const res = await request(app)
      .get(`/api/matrix/projects/${p.id}?dimension=platform`)
      .set("Authorization", `Bearer ${manager.token}`);
    expect(res.status).toBe(200);
    expect(res.body.dimension).toBe("platform");
    expect(res.body.buckets.length).toBeGreaterThan(0);
    expect(res.body.rows.length).toBe(1);
    expect(res.body.rows[0].title).toBe("one");
  });

  it("rejects an invalid dimension", async () => {
    const { manager, company } = await seedBaseline();
    const p = await createProject({ companyId: company.id });
    const res = await request(app)
      .get(`/api/matrix/projects/${p.id}?dimension=nope`)
      .set("Authorization", `Bearer ${manager.token}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("INVALID_DIMENSION");
  });

  it("404 for a project in another company", async () => {
    const { manager, otherCompany } = await seedBaseline();
    const p = await createProject({ companyId: otherCompany.id });
    const res = await request(app)
      .get(`/api/matrix/projects/${p.id}`)
      .set("Authorization", `Bearer ${manager.token}`);
    expect(res.status).toBe(404);
  });

  it("requirement pivot returns requirements as buckets", async () => {
    const { manager, company } = await seedBaseline();
    const p = await createProject({ companyId: company.id });
    const s = await createSuite({ projectId: p.id });
    const c = await createCase({ suiteId: s.id });

    const reqRes = await request(app).post("/api/requirements")
      .set("Authorization", `Bearer ${manager.token}`)
      .send({ projectId: p.id, externalRef: "REQ-1", title: "First requirement" });
    expect(reqRes.status).toBe(201);
    await request(app).post(`/api/requirements/${reqRes.body.id}/cases`)
      .set("Authorization", `Bearer ${manager.token}`).send({ caseId: c.id });

    const res = await request(app)
      .get(`/api/matrix/projects/${p.id}?dimension=requirement`)
      .set("Authorization", `Bearer ${manager.token}`);
    expect(res.status).toBe(200);
    expect(res.body.buckets).toContain("REQ-1");
    expect(res.body.rows).toHaveLength(1);
  });
});
