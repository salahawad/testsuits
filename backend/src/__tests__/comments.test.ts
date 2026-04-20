import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { app } from "../app";
import { resetDb, disconnect } from "./helpers/db";
import { seedBaseline, createProject, createSuite, createCase } from "./helpers/factories";

beforeAll(async () => { await resetDb(); });
afterAll(async () => { await disconnect(); });
beforeEach(async () => { await resetDb(); });

async function caseInCompany(companyId: string) {
  const p = await createProject({ companyId });
  const s = await createSuite({ projectId: p.id });
  const c = await createCase({ suiteId: s.id });
  return { project: p, suite: s, case: c };
}

describe("POST /api/comments", () => {
  it("manager leaves a comment on a case", async () => {
    const { manager, company } = await seedBaseline();
    const { case: c } = await caseInCompany(company.id);
    const res = await request(app)
      .post("/api/comments")
      .set("Authorization", `Bearer ${manager.token}`)
      .send({ body: "Looks fine", caseId: c.id });
    expect(res.status).toBe(201);
    expect(res.body.body).toBe("Looks fine");
    expect(res.body.user.id).toBe(manager.id);
  });

  it("tester can also comment", async () => {
    const { tester, company } = await seedBaseline();
    const { case: c } = await caseInCompany(company.id);
    const res = await request(app)
      .post("/api/comments")
      .set("Authorization", `Bearer ${tester.token}`)
      .send({ body: "Noted", caseId: c.id });
    expect(res.status).toBe(201);
  });

  it("viewer cannot comment (READ_ONLY_ROLE)", async () => {
    const { viewer, company } = await seedBaseline();
    const { case: c } = await caseInCompany(company.id);
    const res = await request(app)
      .post("/api/comments")
      .set("Authorization", `Bearer ${viewer.token}`)
      .send({ body: "X", caseId: c.id });
    expect(res.status).toBe(403);
  });

  it("rejects comment on a cross-company case", async () => {
    const { manager, otherCompany } = await seedBaseline();
    const { case: c } = await caseInCompany(otherCompany.id);
    const res = await request(app)
      .post("/api/comments")
      .set("Authorization", `Bearer ${manager.token}`)
      .send({ body: "Looks fine", caseId: c.id });
    expect(res.status).toBe(404);
  });

  it("requires a target (COMMENT_TARGET_REQUIRED)", async () => {
    const { manager } = await seedBaseline();
    const res = await request(app)
      .post("/api/comments")
      .set("Authorization", `Bearer ${manager.token}`)
      .send({ body: "floating comment" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("COMMENT_TARGET_REQUIRED");
  });
});

describe("GET /api/comments?caseId=...", () => {
  it("lists comments for a case", async () => {
    const { manager, company } = await seedBaseline();
    const { case: c } = await caseInCompany(company.id);
    await request(app).post("/api/comments").set("Authorization", `Bearer ${manager.token}`).send({ body: "one", caseId: c.id });
    await request(app).post("/api/comments").set("Authorization", `Bearer ${manager.token}`).send({ body: "two", caseId: c.id });

    const res = await request(app).get(`/api/comments?caseId=${c.id}`).set("Authorization", `Bearer ${manager.token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body.map((c: any) => c.body)).toEqual(["one", "two"]);
  });
});

describe("DELETE /api/comments/:id", () => {
  it("author deletes their own comment", async () => {
    const { tester, company } = await seedBaseline();
    const { case: c } = await caseInCompany(company.id);
    const created = await request(app).post("/api/comments").set("Authorization", `Bearer ${tester.token}`).send({ body: "mine", caseId: c.id });
    const res = await request(app).delete(`/api/comments/${created.body.id}`).set("Authorization", `Bearer ${tester.token}`);
    expect(res.status).toBe(204);
  });

  it("manager can delete someone else's comment", async () => {
    const { manager, tester, company } = await seedBaseline();
    const { case: c } = await caseInCompany(company.id);
    const created = await request(app).post("/api/comments").set("Authorization", `Bearer ${tester.token}`).send({ body: "theirs", caseId: c.id });
    const res = await request(app).delete(`/api/comments/${created.body.id}`).set("Authorization", `Bearer ${manager.token}`);
    expect(res.status).toBe(204);
  });

  it("tester cannot delete someone else's comment (CANNOT_DELETE_OTHERS_COMMENTS)", async () => {
    const { manager, tester, company } = await seedBaseline();
    const { case: c } = await caseInCompany(company.id);
    const created = await request(app).post("/api/comments").set("Authorization", `Bearer ${manager.token}`).send({ body: "manager's", caseId: c.id });
    const res = await request(app).delete(`/api/comments/${created.body.id}`).set("Authorization", `Bearer ${tester.token}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("CANNOT_DELETE_OTHERS_COMMENTS");
  });
});
