import { describe, it, expect } from "vitest";
import {
  execStatusTone,
  runStatusTone,
  priorityTone,
  milestoneStatusTone,
  execStatusColors,
  runStatusColors,
  priorityColors,
} from "../../lib/status";

describe("execStatusTone", () => {
  it.each([
    ["PASSED", "success"],
    ["FAILED", "danger"],
    ["BLOCKED", "warning"],
    ["SKIPPED", "neutral"],
    ["PENDING", "neutral"],
  ] as const)("maps %s → %s", (status, tone) => {
    expect(execStatusTone(status)).toBe(tone);
  });

  it("falls back to neutral for unknown values", () => {
    expect(execStatusTone("NEW_STATUS_FROM_THE_FUTURE")).toBe("neutral");
  });
});

describe("runStatusTone", () => {
  it.each([
    ["COMPLETED", "success"],
    ["IN_PROGRESS", "info"],
    ["ARCHIVED", "neutral"],
    ["DRAFT", "neutral"],
  ] as const)("maps %s → %s", (status, tone) => {
    expect(runStatusTone(status)).toBe(tone);
  });

  it("defaults unknown values to neutral", () => {
    expect(runStatusTone("WAT")).toBe("neutral");
  });
});

describe("priorityTone", () => {
  it.each([
    ["CRITICAL", "danger"],
    ["HIGH", "warning"],
    ["MEDIUM", "info"],
    ["LOW", "neutral"],
  ] as const)("maps %s → %s", (p, tone) => {
    expect(priorityTone(p)).toBe(tone);
  });

  it("defaults unknown priorities to neutral", () => {
    expect(priorityTone("URGENT")).toBe("neutral");
  });
});

describe("milestoneStatusTone", () => {
  it.each([
    ["RELEASED", "success"],
    ["ACTIVE", "info"],
    ["CANCELLED", "neutral"],
    ["PLANNED", "neutral"],
  ] as const)("maps %s → %s", (status, tone) => {
    expect(milestoneStatusTone(status)).toBe(tone);
  });
});

describe("legacy color maps", () => {
  it("covers every execution status with a non-empty className", () => {
    for (const s of ["PENDING", "PASSED", "FAILED", "BLOCKED", "SKIPPED"]) {
      expect(execStatusColors[s]).toBeDefined();
      expect(execStatusColors[s].length).toBeGreaterThan(0);
    }
  });

  it("covers every run status with a non-empty className", () => {
    for (const s of ["DRAFT", "IN_PROGRESS", "COMPLETED", "ARCHIVED"]) {
      expect(runStatusColors[s]).toBeDefined();
    }
  });

  it("covers every priority with a non-empty className", () => {
    for (const p of ["LOW", "MEDIUM", "HIGH", "CRITICAL"]) {
      expect(priorityColors[p]).toBeDefined();
    }
  });
});
