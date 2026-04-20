import { describe, it, expect } from "vitest";
import {
  projectWhere,
  suiteWhere,
  caseWhere,
  runWhere,
  executionWhere,
  milestoneWhere,
  userListWhere,
} from "../../middleware/scope";
import type { AuthedUser } from "../../middleware/auth";

const manager: AuthedUser = {
  id: "u-mgr",
  email: "m@x.com",
  role: "MANAGER",
  companyId: "c-1",
};
const tester: AuthedUser = {
  id: "u-tst",
  email: "t@x.com",
  role: "TESTER",
  companyId: "c-1",
};
const viewer: AuthedUser = { ...manager, role: "VIEWER" };

describe("projectWhere / suiteWhere / caseWhere / milestoneWhere / userListWhere", () => {
  it("always filters by the user's companyId", () => {
    expect(projectWhere(manager)).toEqual({ companyId: "c-1" });
    expect(suiteWhere(manager)).toEqual({
      project: { companyId: "c-1" },
    });
    expect(caseWhere(manager)).toEqual({
      suite: { project: { companyId: "c-1" } },
    });
    expect(milestoneWhere(manager)).toEqual({
      project: { companyId: "c-1" },
    });
    expect(userListWhere(manager)).toEqual({ companyId: "c-1" });
  });

  it("merges the `extra` where clause", () => {
    expect(projectWhere(manager, { id: "p-1" })).toEqual({
      companyId: "c-1",
      id: "p-1",
    });
  });

  it("applies the same company filter regardless of role for catalog scopes", () => {
    // Projects / suites / cases / milestones do not gate on role — only on
    // company membership. Role-based write restrictions happen in requireWrite.
    expect(projectWhere(tester)).toEqual({ companyId: "c-1" });
    expect(projectWhere(viewer)).toEqual({ companyId: "c-1" });
  });
});

describe("runWhere", () => {
  it("for MANAGER, only filters by company", () => {
    expect(runWhere(manager)).toEqual({
      project: { companyId: "c-1" },
    });
  });

  it("for TESTER, adds an OR clause scoping to their own runs/assignments", () => {
    const w = runWhere(tester);
    expect(w.project).toEqual({ companyId: "c-1" });
    expect(w.OR).toEqual([
      { createdById: "u-tst" },
      { executions: { some: { assigneeId: "u-tst" } } },
      { executions: { some: { executedById: "u-tst" } } },
    ]);
  });

  it("preserves OR when merging extras that do not collide", () => {
    const w = runWhere(tester, { status: "IN_PROGRESS" as any });
    expect(w.OR).toBeDefined();
    expect((w as any).status).toBe("IN_PROGRESS");
  });
});

describe("executionWhere", () => {
  it("for MANAGER, only filters by company", () => {
    expect(executionWhere(manager)).toEqual({
      run: { project: { companyId: "c-1" } },
    });
  });

  it("for TESTER, restricts to assignee or executor", () => {
    const w = executionWhere(tester);
    expect(w.OR).toEqual([
      { assigneeId: "u-tst" },
      { executedById: "u-tst" },
    ]);
  });
});
