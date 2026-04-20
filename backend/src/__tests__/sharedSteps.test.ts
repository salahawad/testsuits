import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { app } from "../app";
import { resetDb, disconnect } from "./helpers/db";
import { seedBaseline, createProject } from "./helpers/factories";

beforeAll(async () => { await resetDb(); });
afterAll(async () => { await disconnect(); });
beforeEach(async () => { await resetDb(); });

describe("/api/shared-steps", () => {
  it("manager creates, lists, updates, and deletes a shared step", async () => {
    const { manager, company } = await seedBaseline();
    const p = await createProject({ companyId: company.id });

    const created = await request(app)
      .post("/api/shared-steps")
      .set("Authorization", `Bearer ${manager.token}`)
      .send({ projectId: p.id, name: "Sign in", action: "Open /login", expected: "Form shown" });
    expect(created.status).toBe(201);
    expect(created.body.name).toBe("Sign in");

    const list = await request(app).get(`/api/shared-steps?projectId=${p.id}`).set("Authorization", `Bearer ${manager.token}`);
    expect(list.body).toHaveLength(1);

    const search = await request(app).get(`/api/shared-steps?projectId=${p.id}&q=sign`).set("Authorization", `Bearer ${manager.token}`);
    expect(search.body).toHaveLength(1);

    const searchMiss = await request(app).get(`/api/shared-steps?projectId=${p.id}&q=nothingmatching`).set("Authorization", `Bearer ${manager.token}`);
    expect(searchMiss.body).toHaveLength(0);

    const patched = await request(app)
      .patch(`/api/shared-steps/${created.body.id}`)
      .set("Authorization", `Bearer ${manager.token}`)
      .send({ name: "Sign in v2" });
    expect(patched.body.name).toBe("Sign in v2");

    const deleted = await request(app).delete(`/api/shared-steps/${created.body.id}`).set("Authorization", `Bearer ${manager.token}`);
    expect(deleted.status).toBe(204);
  });

  it("rejects a shared step for a cross-tenant project (404)", async () => {
    const { manager, otherCompany } = await seedBaseline();
    const p = await createProject({ companyId: otherCompany.id });
    const res = await request(app)
      .post("/api/shared-steps")
      .set("Authorization", `Bearer ${manager.token}`)
      .send({ projectId: p.id, name: "X", action: "Y", expected: "Z" });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("PROJECT_NOT_FOUND");
  });

  it("tester cannot create shared steps", async () => {
    const { tester, company } = await seedBaseline();
    const p = await createProject({ companyId: company.id });
    const res = await request(app)
      .post("/api/shared-steps")
      .set("Authorization", `Bearer ${tester.token}`)
      .send({ projectId: p.id, name: "X", action: "Y", expected: "Z" });
    expect(res.status).toBe(403);
  });

  it("GET without projectId returns 400", async () => {
    const { manager } = await seedBaseline();
    const res = await request(app).get("/api/shared-steps").set("Authorization", `Bearer ${manager.token}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("PROJECT_ID_REQUIRED");
  });
});
