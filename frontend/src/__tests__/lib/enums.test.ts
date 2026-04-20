import { describe, it, expect } from "vitest";
import { TEST_LEVELS, testLevelColors } from "../../lib/enums";

describe("TEST_LEVELS", () => {
  it("lists the five canonical test levels in order", () => {
    expect(TEST_LEVELS).toEqual([
      "SMOKE",
      "SANITY",
      "REGRESSION",
      "ADVANCED",
      "EXPLORATORY",
    ]);
  });
});

describe("testLevelColors", () => {
  it("has a class string for every level", () => {
    for (const lvl of TEST_LEVELS) {
      expect(testLevelColors[lvl]).toBeDefined();
      expect(testLevelColors[lvl].length).toBeGreaterThan(0);
    }
  });

  it("includes dark-mode variants for every level", () => {
    for (const lvl of TEST_LEVELS) {
      expect(testLevelColors[lvl]).toMatch(/dark:/);
    }
  });
});
