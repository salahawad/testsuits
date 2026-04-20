import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { app } from "../app";
import { prisma } from "../db";
import { resetDb, disconnect } from "./helpers/db";
import { seedBaseline, createUser } from "./helpers/factories";

beforeAll(async () => { await resetDb(); });
afterAll(async () => { await disconnect(); });
beforeEach(async () => { await resetDb(); });

describe("GET /api/users", () => {
  it("lists only users in the caller's company", async () => {
    const { manager, company, otherCompany } = await seedBaseline();
    await createUser({ companyId: otherCompany.id, email: "outsider@test.local" });

    const res = await request(app).get("/api/users").set("Authorization", `Bearer ${manager.token}`);
    expect(res.status).toBe(200);
    const emails = res.body.map((u: any) => u.email);
    expect(emails.every((e: string) => !e.startsWith("outsider"))).toBe(true);
    expect(res.body.every((u: any) => typeof u.passwordHash === "undefined")).toBe(true);
  });
});

describe("GET /api/users/me + PATCH /me + PUT /me/password", () => {
  it("returns the caller's profile", async () => {
    const { tester } = await seedBaseline();
    const res = await request(app).get("/api/users/me").set("Authorization", `Bearer ${tester.token}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(tester.id);
    expect(res.body.company).toBeTruthy();
    expect(res.body.passwordHash).toBeUndefined();
  });

  it("PATCH /me updates the display name", async () => {
    const { tester } = await seedBaseline();
    const res = await request(app).patch("/api/users/me").set("Authorization", `Bearer ${tester.token}`).send({ name: "Renamed" });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Renamed");
  });

  it("PUT /me/password rejects wrong current password", async () => {
    const { company } = await seedBaseline();
    const u = await createUser({ companyId: company.id, password: "OldStrongPass1!" });
    const res = await request(app)
      .put("/api/users/me/password")
      .set("Authorization", `Bearer ${u.token}`)
      .send({ currentPassword: "wrong", newPassword: "NewStrongPass2!" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("INCORRECT_PASSWORD");
  });

  it("PUT /me/password accepts the correct current password", async () => {
    const { company } = await seedBaseline();
    const u = await createUser({ companyId: company.id, password: "OldStrongPass1!" });
    const res = await request(app)
      .put("/api/users/me/password")
      .set("Authorization", `Bearer ${u.token}`)
      .send({ currentPassword: "OldStrongPass1!", newPassword: "NewStrongPass2!" });
    expect(res.status).toBe(200);
  });
});

describe("POST /api/users (manager creates a user)", () => {
  it("manager creates a user in their own company", async () => {
    const { manager } = await seedBaseline();
    const res = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${manager.token}`)
      .send({ email: "brand@new.local", name: "Brand New", password: "password123", role: "TESTER" });
    expect(res.status).toBe(201);
    expect(res.body.email).toBe("brand@new.local");
    const db = await prisma.user.findUnique({ where: { email: "brand@new.local" } });
    expect(db?.companyId).toBe(manager.companyId);
  });

  it("rejects duplicate email", async () => {
    const { manager, company } = await seedBaseline();
    await createUser({ companyId: company.id, email: "taken@test.local" });
    const res = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${manager.token}`)
      .send({ email: "taken@test.local", name: "X", password: "password123", role: "TESTER" });
    expect(res.status).toBe(409);
  });

  it("tester cannot create a user", async () => {
    const { tester } = await seedBaseline();
    const res = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${tester.token}`)
      .send({ email: "x@x.com", name: "X", password: "password123", role: "TESTER" });
    expect(res.status).toBe(403);
  });
});

describe("PATCH/DELETE /api/users/:id", () => {
  it("manager updates role of a tester", async () => {
    const { manager, company } = await seedBaseline();
    const u = await createUser({ companyId: company.id, role: "TESTER" });
    const res = await request(app)
      .patch(`/api/users/${u.id}`)
      .set("Authorization", `Bearer ${manager.token}`)
      .send({ role: "MANAGER" });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe("MANAGER");
  });

  it("cannot patch a user in another company (404)", async () => {
    const { manager, otherCompany } = await seedBaseline();
    const u = await createUser({ companyId: otherCompany.id });
    const res = await request(app)
      .patch(`/api/users/${u.id}`)
      .set("Authorization", `Bearer ${manager.token}`)
      .send({ name: "X" });
    expect(res.status).toBe(404);
  });

  it("DELETE /me refuses self-delete (400 CANNOT_DELETE_SELF)", async () => {
    const { manager } = await seedBaseline();
    const res = await request(app).delete(`/api/users/${manager.id}`).set("Authorization", `Bearer ${manager.token}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("CANNOT_DELETE_SELF");
  });

  it("manager deletes another user", async () => {
    const { manager, company } = await seedBaseline();
    const u = await createUser({ companyId: company.id });
    const res = await request(app).delete(`/api/users/${u.id}`).set("Authorization", `Bearer ${manager.token}`);
    expect(res.status).toBe(204);
    expect(await prisma.user.findUnique({ where: { id: u.id } })).toBeNull();
  });
});

describe("PATCH /api/users/:id/lock", () => {
  it("manager locks and unlocks a user", async () => {
    const { manager, company } = await seedBaseline();
    const u = await createUser({ companyId: company.id, password: "StrongPass1!" });

    const lock = await request(app)
      .patch(`/api/users/${u.id}/lock`)
      .set("Authorization", `Bearer ${manager.token}`)
      .send({ locked: true });
    expect(lock.status).toBe(200);
    expect(lock.body.isLocked).toBe(true);

    // Login is blocked.
    const login = await request(app).post("/api/auth/login").send({ email: u.email, password: "StrongPass1!" });
    expect(login.status).toBe(423);

    const unlock = await request(app)
      .patch(`/api/users/${u.id}/lock`)
      .set("Authorization", `Bearer ${manager.token}`)
      .send({ locked: false });
    expect(unlock.body.isLocked).toBe(false);
  });

  it("manager cannot lock themselves (CANNOT_LOCK_SELF)", async () => {
    const { manager } = await seedBaseline();
    const res = await request(app)
      .patch(`/api/users/${manager.id}/lock`)
      .set("Authorization", `Bearer ${manager.token}`)
      .send({ locked: true });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("CANNOT_LOCK_SELF");
  });
});
