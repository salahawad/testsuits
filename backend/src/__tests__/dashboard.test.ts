import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { app } from "../app";
import { resetDb, disconnect } from "./helpers/db";
import { seedBaseline, createProject, createSuite, createCase } from "./helpers/factories";

beforeAll(async () => { await resetDb(); });
afterAll(async () => { await disconnect(); });
beforeEach(async () => { await resetDb(); });

describe("GET /api/dashboard", () => {
  it("returns counts and lists scoped to the caller's company", async () => {
    const { manager, company } = await seedBaseline();
    const p = await createProject({ companyId: company.id });
    const s = await createSuite({ projectId: p.id });
    await createCase({ suiteId: s.id });

    const res = await request(app).get("/api/dashboard").set("Authorization", `Bearer ${manager.token}`);
    expect(res.status).toBe(200);
    expect(res.body.totals.projects).toBe(1);
    expect(res.body.totals.cases).toBe(1);
    expect(Array.isArray(res.body.recentRuns)).toBe(true);
    expect(Array.isArray(res.body.myAssignments)).toBe(true);
  });

  it("requires auth", async () => {
    const res = await request(app).get("/api/dashboard");
    expect(res.status).toBe(401);
  });

  it("isolates counts per company", async () => {
    const { manager, otherCompany } = await seedBaseline();
    const pOther = await createProject({ companyId: otherCompany.id });
    const sOther = await createSuite({ projectId: pOther.id });
    await createCase({ suiteId: sOther.id });

    const res = await request(app).get("/api/dashboard").set("Authorization", `Bearer ${manager.token}`);
    expect(res.body.totals.projects).toBe(0);
    expect(res.body.totals.cases).toBe(0);
  });
});
