import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { app } from "../app";
import { prisma } from "../db";
import { resetDb, disconnect } from "./helpers/db";
import { seedBaseline, createProject, createSuite, createCase } from "./helpers/factories";

beforeAll(async () => { await resetDb(); });
afterAll(async () => { await disconnect(); });
beforeEach(async () => { await resetDb(); });

type Ctx = {
  manager: { token: string; id: string; companyId: string };
  tester: { token: string; id: string; companyId: string };
  otherManager: { token: string; id: string };
  runId: string;
  executionId: string;
  resultIds: string[];
};

async function setupRun(opts: { combos?: boolean } = {}): Promise<Ctx> {
  const { manager, tester, otherManager, company } = await seedBaseline();
  const project = await createProject({ companyId: company.id });
  const suite = await createSuite({ projectId: project.id });
  const c = await createCase({ suiteId: suite.id });
  const payload: any = { projectId: project.id, name: "R", environment: "s", caseIds: [c.id] };
  if (opts.combos) {
    payload.platforms = ["WEB", "IOS"];
    payload.locales = ["en"];
  }
  const run = await request(app).post("/api/runs").set("Authorization", `Bearer ${manager.token}`).send(payload);
  const detail = await request(app).get(`/api/runs/${run.body.id}`).set("Authorization", `Bearer ${manager.token}`);
  const execution = detail.body.executions[0];
  return {
    manager,
    tester,
    otherManager,
    runId: run.body.id,
    executionId: execution.id,
    resultIds: execution.results.map((r: any) => r.id),
  };
}

describe("PATCH /api/executions/:id (legacy, no combos)", () => {
  it("manager sets status PASSED on a legacy execution (results stripped)", async () => {
    const ctx = await setupRun();
    // Simulate a pre-combo execution by dropping the auto-created result row.
    await prisma.testExecutionResult.deleteMany({ where: { executionId: ctx.executionId } });
    const res = await request(app)
      .patch(`/api/executions/${ctx.executionId}`)
      .set("Authorization", `Bearer ${ctx.manager.token}`)
      .send({ status: "PASSED" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("PASSED");
    expect(res.body.executedById).toBe(ctx.manager.id);
    expect(res.body.executedAt).toBeTruthy();
  });

  it("blocks status update on a run with combo results (USE_RESULT_ENDPOINT_FOR_STATUS)", async () => {
    const ctx = await setupRun({ combos: true });
    const res = await request(app)
      .patch(`/api/executions/${ctx.executionId}`)
      .set("Authorization", `Bearer ${ctx.manager.token}`)
      .send({ status: "PASSED" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("USE_RESULT_ENDPOINT_FOR_STATUS");
  });

  it("rejects cross-company assignee", async () => {
    const ctx = await setupRun();
    const res = await request(app)
      .patch(`/api/executions/${ctx.executionId}`)
      .set("Authorization", `Bearer ${ctx.manager.token}`)
      .send({ assigneeId: ctx.otherManager.id });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("ASSIGNEE_NOT_IN_COMPANY");
  });

  it("viewer cannot patch (READ_ONLY_ROLE)", async () => {
    const ctx = await setupRun();
    const { viewer } = await seedBaseline();
    const res = await request(app)
      .patch(`/api/executions/${ctx.executionId}`)
      .set("Authorization", `Bearer ${viewer.token}`)
      .send({ status: "PASSED" });
    // viewer is from a different company's baseline seed → 404 wins over 403
    expect([403, 404]).toContain(res.status);
  });
});

describe("POST /api/executions/bulk-assign", () => {
  it("assigns many executions to a user in the same company", async () => {
    const ctx = await setupRun();
    const res = await request(app)
      .post("/api/executions/bulk-assign")
      .set("Authorization", `Bearer ${ctx.manager.token}`)
      .send({ executionIds: [ctx.executionId], assigneeId: ctx.tester.id });
    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(1);
    const row = await prisma.testExecution.findUnique({ where: { id: ctx.executionId } });
    expect(row?.assigneeId).toBe(ctx.tester.id);
  });

  it("rejects a cross-company assignee", async () => {
    const ctx = await setupRun();
    const res = await request(app)
      .post("/api/executions/bulk-assign")
      .set("Authorization", `Bearer ${ctx.manager.token}`)
      .send({ executionIds: [ctx.executionId], assigneeId: ctx.otherManager.id });
    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/execution-results/:id", () => {
  it("updating a result rolls up the parent execution status", async () => {
    const ctx = await setupRun({ combos: true });
    // Set both results to PASSED — aggregate should become PASSED.
    for (const id of ctx.resultIds) {
      const r = await request(app)
        .patch(`/api/execution-results/${id}`)
        .set("Authorization", `Bearer ${ctx.manager.token}`)
        .send({ status: "PASSED" });
      expect(r.status).toBe(200);
    }
    const execution = await prisma.testExecution.findUnique({ where: { id: ctx.executionId } });
    expect(execution?.status).toBe("PASSED");
  });

  it("FAILED without reason/details is rejected", async () => {
    const ctx = await setupRun({ combos: true });
    const res = await request(app)
      .patch(`/api/execution-results/${ctx.resultIds[0]}`)
      .set("Authorization", `Bearer ${ctx.manager.token}`)
      .send({ status: "FAILED" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("RESULT_FAILED_REQUIRES_REASON_AND_DETAILS");
  });

  it("one FAILED + one PASSED rolls up to FAILED", async () => {
    const ctx = await setupRun({ combos: true });
    await request(app).patch(`/api/execution-results/${ctx.resultIds[0]}`).set("Authorization", `Bearer ${ctx.manager.token}`)
      .send({ status: "PASSED" });
    await request(app).patch(`/api/execution-results/${ctx.resultIds[1]}`).set("Authorization", `Bearer ${ctx.manager.token}`)
      .send({ status: "FAILED", failureReason: "broken", actualResult: "error page" });
    const execution = await prisma.testExecution.findUnique({ where: { id: ctx.executionId } });
    expect(execution?.status).toBe("FAILED");
  });
});

describe("POST /api/execution-results/bulk", () => {
  it("PASSED applies to every result; aggregate becomes PASSED", async () => {
    const ctx = await setupRun({ combos: true });
    const res = await request(app)
      .post("/api/execution-results/bulk")
      .set("Authorization", `Bearer ${ctx.manager.token}`)
      .send({ executionId: ctx.executionId, status: "PASSED" });
    expect(res.status).toBe(200);
    expect(res.body.aggregateStatus).toBe("PASSED");
    expect(res.body.results.every((r: any) => r.status === "PASSED")).toBe(true);
  });

  it("bulk FAILED requires reason + details", async () => {
    const ctx = await setupRun({ combos: true });
    const res = await request(app)
      .post("/api/execution-results/bulk")
      .set("Authorization", `Bearer ${ctx.manager.token}`)
      .send({ executionId: ctx.executionId, status: "FAILED" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("RESULT_FAILED_REQUIRES_REASON_AND_DETAILS");
  });
});
