import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { app } from "../app";
import { resetDb, disconnect } from "./helpers/db";
import { seedBaseline } from "./helpers/factories";

beforeAll(async () => { await resetDb(); });
afterAll(async () => { await disconnect(); });
beforeEach(async () => { await resetDb(); });

describe("GET /api/test-config-options", () => {
  it("lists the company's options (seedBaseline preloads defaults)", async () => {
    const { manager } = await seedBaseline();
    const res = await request(app).get("/api/test-config-options").set("Authorization", `Bearer ${manager.token}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.some((o: any) => o.kind === "PLATFORM" && o.code === "WEB")).toBe(true);
  });

  it("filters by kind", async () => {
    const { manager } = await seedBaseline();
    const res = await request(app).get("/api/test-config-options?kind=LOCALE").set("Authorization", `Bearer ${manager.token}`);
    expect(res.status).toBe(200);
    expect(res.body.every((o: any) => o.kind === "LOCALE")).toBe(true);
  });

  it("excludes soft-deleted rows by default, includes with ?includeDeleted=true", async () => {
    const { manager } = await seedBaseline();
    // Add + soft-delete a row.
    const created = await request(app).post("/api/test-config-options").set("Authorization", `Bearer ${manager.token}`)
      .send({ kind: "PLATFORM", code: "LINUX", label: "Linux" });
    await request(app).delete(`/api/test-config-options/${created.body.id}`).set("Authorization", `Bearer ${manager.token}`);

    const hidden = await request(app).get("/api/test-config-options?kind=PLATFORM").set("Authorization", `Bearer ${manager.token}`);
    expect(hidden.body.find((o: any) => o.code === "LINUX")).toBeUndefined();

    const shown = await request(app).get("/api/test-config-options?kind=PLATFORM&includeDeleted=true").set("Authorization", `Bearer ${manager.token}`);
    const row = shown.body.find((o: any) => o.code === "LINUX");
    expect(row).toBeTruthy();
    expect(row.deletedAt).not.toBeNull();
  });
});

describe("POST /api/test-config-options", () => {
  it("manager creates a new option", async () => {
    const { manager } = await seedBaseline();
    const res = await request(app)
      .post("/api/test-config-options")
      .set("Authorization", `Bearer ${manager.token}`)
      .send({ kind: "PLATFORM", code: "LINUX", label: "Linux" });
    expect(res.status).toBe(201);
    expect(res.body.code).toBe("LINUX");
  });

  it("upserts — reposting the same code restores a soft-deleted row with new label", async () => {
    const { manager } = await seedBaseline();
    const created = await request(app).post("/api/test-config-options").set("Authorization", `Bearer ${manager.token}`)
      .send({ kind: "PLATFORM", code: "LINUX", label: "Linux" });
    await request(app).delete(`/api/test-config-options/${created.body.id}`).set("Authorization", `Bearer ${manager.token}`);

    const re = await request(app).post("/api/test-config-options").set("Authorization", `Bearer ${manager.token}`)
      .send({ kind: "PLATFORM", code: "LINUX", label: "Linux (restored)" });
    expect(re.status).toBe(201);
    expect(re.body.label).toBe("Linux (restored)");
    expect(re.body.deletedAt).toBeNull();
  });

  it("tester cannot create an option", async () => {
    const { tester } = await seedBaseline();
    const res = await request(app).post("/api/test-config-options")
      .set("Authorization", `Bearer ${tester.token}`)
      .send({ kind: "PLATFORM", code: "LINUX", label: "Linux" });
    expect(res.status).toBe(403);
  });
});

describe("PATCH /api/test-config-options/:id + restore", () => {
  it("updates the label", async () => {
    const { manager } = await seedBaseline();
    const created = await request(app).post("/api/test-config-options").set("Authorization", `Bearer ${manager.token}`)
      .send({ kind: "PLATFORM", code: "LINUX", label: "Linux" });
    const res = await request(app).patch(`/api/test-config-options/${created.body.id}`)
      .set("Authorization", `Bearer ${manager.token}`).send({ label: "GNU/Linux" });
    expect(res.status).toBe(200);
    expect(res.body.label).toBe("GNU/Linux");
  });

  it("restore: true un-soft-deletes", async () => {
    const { manager } = await seedBaseline();
    const created = await request(app).post("/api/test-config-options").set("Authorization", `Bearer ${manager.token}`)
      .send({ kind: "PLATFORM", code: "LINUX", label: "Linux" });
    await request(app).delete(`/api/test-config-options/${created.body.id}`).set("Authorization", `Bearer ${manager.token}`);
    const res = await request(app).patch(`/api/test-config-options/${created.body.id}`)
      .set("Authorization", `Bearer ${manager.token}`).send({ restore: true });
    expect(res.status).toBe(200);
    expect(res.body.deletedAt).toBeNull();
  });

  it("404 on id from another company", async () => {
    const { manager, otherManager } = await seedBaseline();
    const other = await request(app).post("/api/test-config-options").set("Authorization", `Bearer ${otherManager.token}`)
      .send({ kind: "PLATFORM", code: "LINUX", label: "Linux" });
    const res = await request(app).patch(`/api/test-config-options/${other.body.id}`)
      .set("Authorization", `Bearer ${manager.token}`).send({ label: "X" });
    expect(res.status).toBe(404);
  });
});
