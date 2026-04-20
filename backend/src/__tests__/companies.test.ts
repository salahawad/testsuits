import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { app } from "../app";
import { resetDb, disconnect } from "./helpers/db";
import { seedBaseline } from "./helpers/factories";

beforeAll(async () => { await resetDb(); });
afterAll(async () => { await disconnect(); });
beforeEach(async () => { await resetDb(); });

describe("GET /api/companies/current", () => {
  it("returns the caller's company with counts", async () => {
    const { manager, company } = await seedBaseline();
    const res = await request(app).get("/api/companies/current").set("Authorization", `Bearer ${manager.token}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(company.id);
    expect(res.body._count).toBeTruthy();
    expect(res.body._count.users).toBeGreaterThanOrEqual(4);
  });

  it("tester can read current company", async () => {
    const { tester } = await seedBaseline();
    const res = await request(app).get("/api/companies/current").set("Authorization", `Bearer ${tester.token}`);
    expect(res.status).toBe(200);
  });
});

describe("PATCH /api/companies/current", () => {
  it("manager renames the company", async () => {
    const { manager } = await seedBaseline();
    const res = await request(app)
      .patch("/api/companies/current")
      .set("Authorization", `Bearer ${manager.token}`)
      .send({ name: "Renamed Inc." });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Renamed Inc.");
  });

  it("tester cannot rename (403)", async () => {
    const { tester } = await seedBaseline();
    const res = await request(app)
      .patch("/api/companies/current")
      .set("Authorization", `Bearer ${tester.token}`)
      .send({ name: "x" });
    expect(res.status).toBe(403);
  });
});
