import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { app } from "../app";
import { prisma } from "../db";
import { resetDb, disconnect } from "./helpers/db";
import { seedBaseline, createProject, createMilestone } from "./helpers/factories";

beforeAll(async () => { await resetDb(); });
afterAll(async () => { await disconnect(); });
beforeEach(async () => { await resetDb(); });

describe("GET /api/milestones", () => {
  it("lists milestones, scoped to caller's company", async () => {
    const { manager, company, otherCompany } = await seedBaseline();
    const pMine = await createProject({ companyId: company.id });
    const pOther = await createProject({ companyId: otherCompany.id });
    await createMilestone({ projectId: pMine.id, name: "Mine" });
    await createMilestone({ projectId: pOther.id, name: "Theirs" });

    const res = await request(app).get("/api/milestones").set("Authorization", `Bearer ${manager.token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe("Mine");
  });

  it("filters by projectId", async () => {
    const { manager, company } = await seedBaseline();
    const p1 = await createProject({ companyId: company.id, key: "P1" });
    const p2 = await createProject({ companyId: company.id, key: "P2" });
    await createMilestone({ projectId: p1.id, name: "A" });
    await createMilestone({ projectId: p2.id, name: "B" });

    const res = await request(app).get(`/api/milestones?projectId=${p1.id}`).set("Authorization", `Bearer ${manager.token}`);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe("A");
  });
});

describe("POST/PATCH/DELETE /api/milestones", () => {
  it("manager creates a milestone", async () => {
    const { manager, company } = await seedBaseline();
    const p = await createProject({ companyId: company.id });
    const res = await request(app)
      .post("/api/milestones")
      .set("Authorization", `Bearer ${manager.token}`)
      .send({ projectId: p.id, name: "v1.0", status: "PLANNED" });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("v1.0");
  });

  it("rejects duplicate milestone name within a project (409)", async () => {
    const { manager, company } = await seedBaseline();
    const p = await createProject({ companyId: company.id });
    await createMilestone({ projectId: p.id, name: "v1.0" });
    const res = await request(app)
      .post("/api/milestones")
      .set("Authorization", `Bearer ${manager.token}`)
      .send({ projectId: p.id, name: "v1.0" });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("MILESTONE_NAME_TAKEN");
  });

  it("rejects creation on a cross-company project", async () => {
    const { manager, otherCompany } = await seedBaseline();
    const p = await createProject({ companyId: otherCompany.id });
    const res = await request(app)
      .post("/api/milestones")
      .set("Authorization", `Bearer ${manager.token}`)
      .send({ projectId: p.id, name: "v1.0" });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("PROJECT_NOT_FOUND");
  });

  it("tester cannot create a milestone", async () => {
    const { tester, company } = await seedBaseline();
    const p = await createProject({ companyId: company.id });
    const res = await request(app)
      .post("/api/milestones")
      .set("Authorization", `Bearer ${tester.token}`)
      .send({ projectId: p.id, name: "v1.0" });
    expect(res.status).toBe(403);
  });

  it("manager updates and deletes a milestone", async () => {
    const { manager, company } = await seedBaseline();
    const p = await createProject({ companyId: company.id });
    const m = await createMilestone({ projectId: p.id, name: "old" });

    const patch = await request(app)
      .patch(`/api/milestones/${m.id}`)
      .set("Authorization", `Bearer ${manager.token}`)
      .send({ name: "new", status: "ACTIVE" });
    expect(patch.status).toBe(200);
    expect(patch.body.name).toBe("new");
    expect(patch.body.status).toBe("ACTIVE");

    const del = await request(app).delete(`/api/milestones/${m.id}`).set("Authorization", `Bearer ${manager.token}`);
    expect(del.status).toBe(204);
    expect(await prisma.milestone.findUnique({ where: { id: m.id } })).toBeNull();
  });
});
