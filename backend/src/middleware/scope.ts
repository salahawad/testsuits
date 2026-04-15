import { Prisma } from "@prisma/client";
import { AuthedUser } from "./auth";

/**
 * Centralised authorization scope. Every route that reads or writes tenant data
 * must pass its Prisma where through one of these helpers so cross-company or
 * out-of-scope records cannot leak.
 *
 * Rules:
 *  - MANAGER: full access within their company.
 *  - TESTER:  full read within their company for the catalogue (projects, suites,
 *             cases, milestones), but runs/executions are restricted to those
 *             they created or are assigned to.
 */

export function projectWhere(user: AuthedUser, extra: Prisma.ProjectWhereInput = {}): Prisma.ProjectWhereInput {
  return { companyId: user.companyId, ...extra };
}

export function suiteWhere(user: AuthedUser, extra: Prisma.TestSuiteWhereInput = {}): Prisma.TestSuiteWhereInput {
  return { project: { companyId: user.companyId }, ...extra };
}

export function caseWhere(user: AuthedUser, extra: Prisma.TestCaseWhereInput = {}): Prisma.TestCaseWhereInput {
  return { suite: { project: { companyId: user.companyId } }, ...extra };
}

export function runWhere(user: AuthedUser, extra: Prisma.TestRunWhereInput = {}): Prisma.TestRunWhereInput {
  const base: Prisma.TestRunWhereInput = { project: { companyId: user.companyId } };
  if (user.role === "TESTER") {
    base.OR = [
      { createdById: user.id },
      { executions: { some: { assigneeId: user.id } } },
      { executions: { some: { executedById: user.id } } },
    ];
  }
  return { ...base, ...extra };
}

export function executionWhere(user: AuthedUser, extra: Prisma.TestExecutionWhereInput = {}): Prisma.TestExecutionWhereInput {
  const base: Prisma.TestExecutionWhereInput = {
    run: { project: { companyId: user.companyId } },
  };
  if (user.role === "TESTER") {
    base.OR = [{ assigneeId: user.id }, { executedById: user.id }];
  }
  return { ...base, ...extra };
}

export function milestoneWhere(user: AuthedUser, extra: Prisma.MilestoneWhereInput = {}): Prisma.MilestoneWhereInput {
  return { project: { companyId: user.companyId }, ...extra };
}

export function userListWhere(user: AuthedUser): Prisma.UserWhereInput {
  return { companyId: user.companyId };
}
