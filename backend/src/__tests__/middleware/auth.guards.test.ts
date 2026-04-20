import { describe, it, expect, vi, beforeAll } from "vitest";
import type { Response } from "express";

beforeAll(() => {
  process.env.JWT_SECRET = "unit-test-secret-do-not-use-in-prod";
});

async function loadAuth() {
  return await import("../../middleware/auth");
}

function mockRes() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res as unknown as Response & {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };
}

describe("requireManager", () => {
  it("passes through for MANAGER", async () => {
    const { requireManager } = await loadAuth();
    const res = mockRes();
    const next = vi.fn();
    requireManager(
      { user: { role: "MANAGER" } } as any,
      res,
      next,
    );
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("passes through for ADMIN", async () => {
    const { requireManager } = await loadAuth();
    const res = mockRes();
    const next = vi.fn();
    requireManager({ user: { role: "ADMIN" } } as any, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("rejects TESTER with 403 MANAGER_ROLE_REQUIRED", async () => {
    const { requireManager } = await loadAuth();
    const res = mockRes();
    const next = vi.fn();
    requireManager({ user: { role: "TESTER" } } as any, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "MANAGER_ROLE_REQUIRED" });
  });

  it("rejects a missing user with 403", async () => {
    const { requireManager } = await loadAuth();
    const res = mockRes();
    const next = vi.fn();
    requireManager({} as any, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe("requireAdmin", () => {
  it("passes through for ADMIN", async () => {
    const { requireAdmin } = await loadAuth();
    const res = mockRes();
    const next = vi.fn();
    requireAdmin({ user: { role: "ADMIN" } } as any, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("rejects MANAGER", async () => {
    const { requireAdmin } = await loadAuth();
    const res = mockRes();
    const next = vi.fn();
    requireAdmin({ user: { role: "MANAGER" } } as any, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "ADMIN_ROLE_REQUIRED" });
  });
});

describe("requireWrite", () => {
  it("rejects VIEWER", async () => {
    const { requireWrite } = await loadAuth();
    const res = mockRes();
    const next = vi.fn();
    requireWrite({ user: { role: "VIEWER" } } as any, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "READ_ONLY_ROLE" });
    expect(next).not.toHaveBeenCalled();
  });

  it("lets TESTER / MANAGER / ADMIN through", async () => {
    const { requireWrite } = await loadAuth();
    for (const role of ["TESTER", "MANAGER", "ADMIN"] as const) {
      const res = mockRes();
      const next = vi.fn();
      requireWrite({ user: { role } } as any, res, next);
      expect(next).toHaveBeenCalled();
    }
  });
});
