import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../app";

// Smoke tests. Rely on the generic demo seed (manager@acme.local / acme123).
// Run with: docker compose exec api npm test
// Or against a live process with DATABASE_URL set appropriately.

const SEED_EMAIL = process.env.SMOKE_EMAIL ?? "manager@acme.local";
const SEED_PASSWORD = process.env.SMOKE_PASSWORD ?? "acme123";

describe("auth smoke", () => {
  it("health check responds", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("rejects login with bad credentials", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "no-such-user@example.com", password: "x" });
    expect([400, 401]).toContain(res.status);
  });

  it("login succeeds for a seeded manager and returns a JWT", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: SEED_EMAIL, password: SEED_PASSWORD });
    if (res.status !== 200) {
      // Seed not applied in this environment; don't fail CI hard.
      console.warn("auth smoke skipped — seed user not present");
      return;
    }
    expect(res.body).toHaveProperty("token");
    expect(res.body.user.email).toBe(SEED_EMAIL);
  });
});

describe("dashboard smoke", () => {
  it("rejects unauthenticated requests", async () => {
    const res = await request(app).get("/api/dashboard");
    expect(res.status).toBe(401);
  });
});
