import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { app } from "../app";
import { prisma } from "../db";
import { resetDb, disconnect } from "./helpers/db";
import { createCompany, createUser, seedBaseline } from "./helpers/factories";

beforeAll(async () => { await resetDb(); });
afterAll(async () => { await disconnect(); });
beforeEach(async () => { await resetDb(); });

describe("GET /api/health", () => {
  it("returns ok without auth", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});

describe("POST /api/auth/login", () => {
  it("returns a JWT on valid credentials", async () => {
    const company = await createCompany();
    await createUser({ companyId: company.id, email: "a@test.local", password: "Sup3rStrongPass!", role: "MANAGER" });

    const res = await request(app).post("/api/auth/login").send({ email: "a@test.local", password: "Sup3rStrongPass!" });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.email).toBe("a@test.local");
    expect(res.body.user.role).toBe("MANAGER");
  });

  it("returns 401 for unknown email", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: "nobody@test.local", password: "whatever" });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("INVALID_CREDENTIALS");
  });

  it("returns 401 for wrong password", async () => {
    const company = await createCompany();
    await createUser({ companyId: company.id, email: "a@test.local", password: "CorrectPass123!" });
    const res = await request(app).post("/api/auth/login").send({ email: "a@test.local", password: "WrongPass123!" });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("INVALID_CREDENTIALS");
  });

  it("blocks login when account is manager-locked", async () => {
    const company = await createCompany();
    const u = await createUser({ companyId: company.id, password: "StrongPass123!" });
    await prisma.user.update({ where: { id: u.id }, data: { isLocked: true } });
    const res = await request(app).post("/api/auth/login").send({ email: u.email, password: "StrongPass123!" });
    expect(res.status).toBe(423);
    expect(res.body.error).toBe("ACCOUNT_LOCKED");
  });

  it("blocks login when email is not verified", async () => {
    const company = await createCompany();
    const u = await createUser({ companyId: company.id, password: "StrongPass123!", verified: false });
    const res = await request(app).post("/api/auth/login").send({ email: u.email, password: "StrongPass123!" });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("EMAIL_NOT_VERIFIED");
  });

  it("locks the account after 5 consecutive bad attempts", async () => {
    const company = await createCompany();
    const u = await createUser({ companyId: company.id, password: "CorrectPass123!" });
    for (let i = 0; i < 4; i++) {
      const r = await request(app).post("/api/auth/login").send({ email: u.email, password: "wrong" });
      expect(r.status).toBe(401);
    }
    // 5th attempt triggers lockout.
    const r = await request(app).post("/api/auth/login").send({ email: u.email, password: "wrong" });
    expect(r.status).toBe(423);
    expect(r.body.error).toBe("ACCOUNT_TEMPORARILY_LOCKED");
    // Even with the correct password now, login is rejected while lockout is active.
    const r2 = await request(app).post("/api/auth/login").send({ email: u.email, password: "CorrectPass123!" });
    expect(r2.status).toBe(423);
  });

  it("rejects invalid request shape (400)", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: "not-an-email" });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/auth/signup", () => {
  it("creates a new company + manager and returns a dev verification token", async () => {
    const res = await request(app)
      .post("/api/auth/signup")
      .send({ email: "founder@acme.local", password: "StrongPassword1!", name: "Founder", companyName: "Acme" });
    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.devToken).toBeTruthy();

    const user = await prisma.user.findUnique({ where: { email: "founder@acme.local" } });
    expect(user?.role).toBe("MANAGER");
    expect(user?.emailVerifiedAt).toBeNull();
  });

  it("rejects weak passwords", async () => {
    const res = await request(app)
      .post("/api/auth/signup")
      .send({ email: "founder@acme.local", password: "password", name: "Founder", companyName: "Acme" });
    expect(res.status).toBe(400);
  });

  it("rejects duplicate email", async () => {
    const company = await createCompany();
    await createUser({ companyId: company.id, email: "dup@test.local" });
    const res = await request(app)
      .post("/api/auth/signup")
      .send({ email: "dup@test.local", password: "StrongPassword1!", name: "Dup", companyName: "X" });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("EMAIL_ALREADY_IN_USE");
  });
});

describe("POST /api/auth/forgot + /reset", () => {
  it("issues a reset token and consumes it to set a new password", async () => {
    const company = await createCompany();
    const u = await createUser({ companyId: company.id, password: "OldStrongPass1!" });

    const forgot = await request(app).post("/api/auth/forgot").send({ email: u.email });
    expect(forgot.status).toBe(200);
    expect(forgot.body.devToken).toBeTruthy();

    const reset = await request(app).post("/api/auth/reset").send({ token: forgot.body.devToken, password: "NewStrongPass2!" });
    expect(reset.status).toBe(200);

    const login = await request(app).post("/api/auth/login").send({ email: u.email, password: "NewStrongPass2!" });
    expect(login.status).toBe(200);
  });

  it("does not reveal whether the email exists", async () => {
    const res = await request(app).post("/api/auth/forgot").send({ email: "ghost@test.local" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.devToken).toBeUndefined();
  });

  it("rejects a consumed reset token on second use", async () => {
    const company = await createCompany();
    const u = await createUser({ companyId: company.id });
    const f = await request(app).post("/api/auth/forgot").send({ email: u.email });
    await request(app).post("/api/auth/reset").send({ token: f.body.devToken, password: "NewStrongPass2!" });
    const again = await request(app).post("/api/auth/reset").send({ token: f.body.devToken, password: "YetAnother3!" });
    expect(again.status).toBe(400);
    expect(again.body.error).toBe("RESET_LINK_INVALID");
  });

  it("invalidates existing JWTs after password reset (SESSION_REVOKED)", async () => {
    const company = await createCompany();
    const u = await createUser({ companyId: company.id, password: "OldStrongPass1!" });
    // Wait 1s so passwordUpdatedAt will be strictly greater than the JWT iat.
    await new Promise((r) => setTimeout(r, 1100));

    const f = await request(app).post("/api/auth/forgot").send({ email: u.email });
    await request(app).post("/api/auth/reset").send({ token: f.body.devToken, password: "NewStrongPass2!" });

    const res = await request(app).get("/api/projects").set("Authorization", `Bearer ${u.token}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("SESSION_REVOKED");
  });
});

describe("POST /api/auth/verify-email + /resend-verification", () => {
  it("verifies an unverified user and returns a JWT", async () => {
    // Use signup so we get a real verification token via the dev leak.
    const signup = await request(app).post("/api/auth/signup").send({
      email: "v@test.local", password: "StrongPassword1!", name: "V", companyName: "V Co",
    });
    const verify = await request(app).post("/api/auth/verify-email").send({ token: signup.body.devToken });
    expect(verify.status).toBe(200);
    expect(verify.body.token).toBeTruthy();
    expect(verify.body.user.email).toBe("v@test.local");

    const dbUser = await prisma.user.findUnique({ where: { email: "v@test.local" } });
    expect(dbUser?.emailVerifiedAt).not.toBeNull();
  });

  it("rejects an invalid verification token", async () => {
    const res = await request(app).post("/api/auth/verify-email").send({ token: "x".repeat(24) });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("VERIFICATION_LINK_INVALID");
  });

  it("resend-verification issues a fresh token for an unverified user", async () => {
    const signup = await request(app).post("/api/auth/signup").send({
      email: "rv@test.local", password: "StrongPassword1!", name: "RV", companyName: "RV Co",
    });
    const resend = await request(app).post("/api/auth/resend-verification").send({ email: "rv@test.local" });
    expect(resend.status).toBe(200);
    expect(resend.body.devToken).toBeTruthy();
    expect(resend.body.devToken).not.toBe(signup.body.devToken);
  });
});

describe("POST /api/auth/invite + /accept-invite", () => {
  it("manager can invite a tester; tester accepts to join the same company", async () => {
    const { manager, company } = await seedBaseline();
    const invite = await request(app)
      .post("/api/auth/invite")
      .set("Authorization", `Bearer ${manager.token}`)
      .send({ email: "newtester@test.local", name: "New Tester", role: "TESTER" });
    expect(invite.status).toBe(201);
    expect(invite.body.devToken).toBeTruthy();

    const accept = await request(app)
      .post("/api/auth/accept-invite")
      .send({ token: invite.body.devToken, password: "InvitedPass1!" });
    expect(accept.status).toBe(201);
    expect(accept.body.user.role).toBe("TESTER");
    expect(accept.body.user.company.id).toBe(company.id);
  });

  it("tester cannot invite (403 MANAGER_ROLE_REQUIRED)", async () => {
    const { tester } = await seedBaseline();
    const res = await request(app)
      .post("/api/auth/invite")
      .set("Authorization", `Bearer ${tester.token}`)
      .send({ email: "x@test.local", name: "X", role: "TESTER" });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("MANAGER_ROLE_REQUIRED");
  });

  it("invite preview returns company info for a valid token", async () => {
    const { manager } = await seedBaseline();
    const invite = await request(app)
      .post("/api/auth/invite")
      .set("Authorization", `Bearer ${manager.token}`)
      .send({ email: "preview@test.local", name: "Preview", role: "VIEWER" });
    const preview = await request(app).get(`/api/auth/invite/${invite.body.devToken}`);
    expect(preview.status).toBe(200);
    expect(preview.body.role).toBe("VIEWER");
    expect(preview.body.email).toBe("preview@test.local");
  });

  it("rejects accept-invite when the token has already been consumed", async () => {
    const { manager } = await seedBaseline();
    const invite = await request(app)
      .post("/api/auth/invite")
      .set("Authorization", `Bearer ${manager.token}`)
      .send({ email: "once@test.local", name: "Once", role: "TESTER" });
    await request(app).post("/api/auth/accept-invite").send({ token: invite.body.devToken, password: "InvitedPass1!" });
    const second = await request(app).post("/api/auth/accept-invite").send({ token: invite.body.devToken, password: "OtherPass2!" });
    expect(second.status).toBe(400);
    expect(second.body.error).toBe("INVITE_INVALID");
  });

  it("rejects invite for an email already in use", async () => {
    const { manager } = await seedBaseline();
    await createUser({ companyId: manager.companyId, email: "taken@test.local" });
    const res = await request(app)
      .post("/api/auth/invite")
      .set("Authorization", `Bearer ${manager.token}`)
      .send({ email: "taken@test.local", name: "Taken", role: "TESTER" });
    expect(res.status).toBe(409);
  });
});

describe("requireAuth middleware", () => {
  it("rejects unauthenticated requests with 401", async () => {
    const res = await request(app).get("/api/projects");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("UNAUTHORIZED");
  });

  it("rejects malformed bearer tokens", async () => {
    const res = await request(app).get("/api/projects").set("Authorization", "Bearer not.a.jwt");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("INVALID_TOKEN");
  });

  it("rejects API-token-shaped strings that don't match any row", async () => {
    const res = await request(app).get("/api/projects").set("Authorization", "Bearer ts_doesnotexist");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("INVALID_API_TOKEN");
  });
});
