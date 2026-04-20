import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { app } from "../app";
import { prisma } from "../db";
import { resetDb, disconnect } from "./helpers/db";
import { seedBaseline, createProject } from "./helpers/factories";

beforeAll(async () => { await resetDb(); });
afterAll(async () => { await disconnect(); });
beforeEach(async () => { await resetDb(); });

describe("GET /api/projects", () => {
  it("returns only projects in the caller's company", async () => {
    const { manager, company, otherCompany } = await seedBaseline();
    await createProject({ companyId: company.id, key: "MINE", name: "Mine" });
    await createProject({ companyId: otherCompany.id, key: "THEIRS", name: "Theirs" });

    const res = await request(app).get("/api/projects").set("Authorization", `Bearer ${manager.token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].key).toBe("MINE");
  });

  it("requires auth", async () => {
    const res = await request(app).get("/api/projects");
    expect(res.status).toBe(401);
  });
});

describe("POST /api/projects", () => {
  it("manager creates a project", async () => {
    const { manager } = await seedBaseline();
    const res = await request(app)
      .post("/api/projects")
      .set("Authorization", `Bearer ${manager.token}`)
      .send({ key: "ACME", name: "Acme Project" });
    expect(res.status).toBe(201);
    expect(res.body.key).toBe("ACME");
    expect(res.body.companyId).toBe(manager.companyId);
  });

  it("tester cannot create a project", async () => {
    const { tester } = await seedBaseline();
    const res = await request(app)
      .post("/api/projects")
      .set("Authorization", `Bearer ${tester.token}`)
      .send({ key: "X", name: "X" });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("MANAGER_ROLE_REQUIRED");
  });

  it("rejects invalid key (must be A-Z0-9_-)", async () => {
    const { manager } = await seedBaseline();
    const res = await request(app)
      .post("/api/projects")
      .set("Authorization", `Bearer ${manager.token}`)
      .send({ key: "lowercase", name: "X" });
    expect(res.status).toBe(400);
  });

  it("rejects duplicate key within a company", async () => {
    const { manager, company } = await seedBaseline();
    await createProject({ companyId: company.id, key: "DUP", name: "First" });
    const res = await request(app)
      .post("/api/projects")
      .set("Authorization", `Bearer ${manager.token}`)
      .send({ key: "DUP", name: "Second" });
    expect(res.status).toBe(500); // Prisma P2002 → 500 unless specially handled
  });
});

describe("GET/PATCH/DELETE /api/projects/:id", () => {
  it("fetches a project the caller owns", async () => {
    const { manager, company } = await seedBaseline();
    const p = await createProject({ companyId: company.id });
    const res = await request(app).get(`/api/projects/${p.id}`).set("Authorization", `Bearer ${manager.token}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(p.id);
    expect(Array.isArray(res.body.suites)).toBe(true);
  });

  it("returns 404 for a project in another company", async () => {
    const { manager, otherCompany } = await seedBaseline();
    const p = await createProject({ companyId: otherCompany.id });
    const res = await request(app).get(`/api/projects/${p.id}`).set("Authorization", `Bearer ${manager.token}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("PROJECT_NOT_FOUND");
  });

  it("manager patches a project name", async () => {
    const { manager, company } = await seedBaseline();
    const p = await createProject({ companyId: company.id, name: "Old" });
    const res = await request(app)
      .patch(`/api/projects/${p.id}`)
      .set("Authorization", `Bearer ${manager.token}`)
      .send({ name: "New" });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("New");
  });

  it("viewer cannot patch a project", async () => {
    const { viewer, company } = await seedBaseline();
    const p = await createProject({ companyId: company.id });
    const res = await request(app)
      .patch(`/api/projects/${p.id}`)
      .set("Authorization", `Bearer ${viewer.token}`)
      .send({ name: "X" });
    expect(res.status).toBe(403);
  });

  it("manager deletes a project", async () => {
    const { manager, company } = await seedBaseline();
    const p = await createProject({ companyId: company.id });
    const res = await request(app).delete(`/api/projects/${p.id}`).set("Authorization", `Bearer ${manager.token}`);
    expect(res.status).toBe(204);
    expect(await prisma.project.findUnique({ where: { id: p.id } })).toBeNull();
  });
});

describe("PUT /api/projects/:id/custom-fields", () => {
  it("saves a list of typed custom fields", async () => {
    const { manager, company } = await seedBaseline();
    const p = await createProject({ companyId: company.id });
    const res = await request(app)
      .put(`/api/projects/${p.id}/custom-fields`)
      .set("Authorization", `Bearer ${manager.token}`)
      .send([
        { label: "Browser", type: "text", required: true },
        { label: "Severity", type: "select", options: ["low", "high"] },
      ]);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[1].type).toBe("select");
    expect(res.body[1].options).toEqual(["low", "high"]);
  });

  it("rejects a select without options", async () => {
    const { manager, company } = await seedBaseline();
    const p = await createProject({ companyId: company.id });
    const res = await request(app)
      .put(`/api/projects/${p.id}/custom-fields`)
      .set("Authorization", `Bearer ${manager.token}`)
      .send([{ label: "Severity", type: "select" }]);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("CUSTOM_FIELD_REQUIRES_OPTIONS");
  });
});
