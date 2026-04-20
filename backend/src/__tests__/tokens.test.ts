import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { app } from "../app";
import { prisma } from "../db";
import { resetDb, disconnect } from "./helpers/db";
import { seedBaseline } from "./helpers/factories";

beforeAll(async () => { await resetDb(); });
afterAll(async () => { await disconnect(); });
beforeEach(async () => { await resetDb(); });

describe("POST /api/tokens", () => {
  it("manager creates an API token and receives plaintext exactly once", async () => {
    const { manager } = await seedBaseline();
    const res = await request(app)
      .post("/api/tokens")
      .set("Authorization", `Bearer ${manager.token}`)
      .send({ name: "ci-pipeline" });
    expect(res.status).toBe(201);
    expect(res.body.plaintext.startsWith("ts_")).toBe(true);
    expect(res.body.name).toBe("ci-pipeline");

    // Listing never leaks plaintext.
    const list = await request(app).get("/api/tokens").set("Authorization", `Bearer ${manager.token}`);
    expect(list.body[0].plaintext).toBeUndefined();
  });

  it("tester cannot create a token (403 MANAGER_ROLE_REQUIRED — mounted with requireManager)", async () => {
    const { tester } = await seedBaseline();
    const res = await request(app)
      .post("/api/tokens")
      .set("Authorization", `Bearer ${tester.token}`)
      .send({ name: "x" });
    expect(res.status).toBe(403);
  });

  it("generated token authenticates subsequent requests", async () => {
    const { manager } = await seedBaseline();
    const make = await request(app)
      .post("/api/tokens")
      .set("Authorization", `Bearer ${manager.token}`)
      .send({ name: "probe" });

    const projects = await request(app).get("/api/projects").set("Authorization", `Bearer ${make.body.plaintext}`);
    expect(projects.status).toBe(200);
  });

  it("API-token session cannot manage tokens (INTERACTIVE_SESSION_REQUIRED)", async () => {
    const { manager } = await seedBaseline();
    const make = await request(app)
      .post("/api/tokens")
      .set("Authorization", `Bearer ${manager.token}`)
      .send({ name: "probe" });

    const listViaToken = await request(app).get("/api/tokens").set("Authorization", `Bearer ${make.body.plaintext}`);
    expect(listViaToken.status).toBe(403);
    expect(listViaToken.body.error).toBe("INTERACTIVE_SESSION_REQUIRED");
  });
});

describe("DELETE /api/tokens/:id", () => {
  it("revokes a token and subsequent requests fail", async () => {
    const { manager } = await seedBaseline();
    const make = await request(app)
      .post("/api/tokens")
      .set("Authorization", `Bearer ${manager.token}`)
      .send({ name: "probe" });

    const del = await request(app).delete(`/api/tokens/${make.body.id}`).set("Authorization", `Bearer ${manager.token}`);
    expect(del.status).toBe(204);
    expect(await prisma.apiToken.findUnique({ where: { id: make.body.id } })).toBeNull();

    const after = await request(app).get("/api/projects").set("Authorization", `Bearer ${make.body.plaintext}`);
    expect(after.status).toBe(401);
    expect(after.body.error).toBe("INVALID_API_TOKEN");
  });

  it("404 when deleting someone else's token", async () => {
    const { manager, otherManager } = await seedBaseline();
    const make = await request(app)
      .post("/api/tokens")
      .set("Authorization", `Bearer ${otherManager.token}`)
      .send({ name: "other" });

    const res = await request(app).delete(`/api/tokens/${make.body.id}`).set("Authorization", `Bearer ${manager.token}`);
    expect(res.status).toBe(404);
  });
});
