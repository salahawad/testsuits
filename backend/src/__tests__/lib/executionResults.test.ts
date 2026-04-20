import { describe, it, expect } from "vitest";
import {
  parseLocales,
  buildCombos,
  aggregateStatus,
} from "../../lib/executionResults";

describe("parseLocales", () => {
  it("returns [''] when nothing is supplied", () => {
    expect(parseLocales(undefined)).toEqual([""]);
    expect(parseLocales(null)).toEqual([""]);
    expect(parseLocales([])).toEqual([""]);
  });

  it("trims and drops empty entries from the multi-select array", () => {
    expect(parseLocales(["en", " fr ", "", "  "])).toEqual(["en", "fr"]);
  });

  it("prefers the multi-select array over the legacy string", () => {
    expect(parseLocales(["en"], "fr,de")).toEqual(["en"]);
  });

  it("falls back to the legacy comma-separated locale when array is empty", () => {
    expect(parseLocales([], "en, fr , de")).toEqual(["en", "fr", "de"]);
  });

  it("falls back to [''] when both inputs are empty", () => {
    expect(parseLocales(["  "], ",  ,")).toEqual([""]);
  });
});

describe("buildCombos", () => {
  it("collapses empty platform/connectivity to a single null row", () => {
    expect(buildCombos([], [], [])).toEqual([
      { platform: null, connectivity: null, locale: "" },
    ]);
  });

  it("produces the full cartesian product", () => {
    const combos = buildCombos(["WEB", "IOS"], ["ONLINE"], ["en", "fr"]);
    expect(combos).toHaveLength(4);
    expect(combos).toContainEqual({
      platform: "WEB",
      connectivity: "ONLINE",
      locale: "en",
    });
    expect(combos).toContainEqual({
      platform: "IOS",
      connectivity: "ONLINE",
      locale: "fr",
    });
  });

  it("uses the legacy locale string as fallback", () => {
    const combos = buildCombos(["WEB"], ["ONLINE"], undefined, "en,fr");
    expect(combos.map((c) => c.locale).sort()).toEqual(["en", "fr"]);
  });

  it("keeps locale empty when nothing was supplied", () => {
    const combos = buildCombos(["WEB"], ["ONLINE"], undefined);
    expect(combos).toEqual([
      { platform: "WEB", connectivity: "ONLINE", locale: "" },
    ]);
  });
});

describe("aggregateStatus", () => {
  it("returns PENDING for an empty list", () => {
    expect(aggregateStatus([])).toBe("PENDING");
  });

  it("rolls up to FAILED when any child is FAILED", () => {
    expect(aggregateStatus(["PASSED", "FAILED", "BLOCKED"])).toBe("FAILED");
  });

  it("rolls up to BLOCKED when no FAILED but any BLOCKED", () => {
    expect(aggregateStatus(["PASSED", "BLOCKED", "PENDING"])).toBe("BLOCKED");
  });

  it("rolls up to PENDING when any PENDING (and no FAILED/BLOCKED)", () => {
    expect(aggregateStatus(["PASSED", "PENDING", "SKIPPED"])).toBe("PENDING");
  });

  it("returns SKIPPED only when every child is SKIPPED", () => {
    expect(aggregateStatus(["SKIPPED", "SKIPPED"])).toBe("SKIPPED");
    expect(aggregateStatus(["SKIPPED", "PASSED"])).toBe("PASSED");
  });

  it("mixes of PASSED + SKIPPED count as PASSED", () => {
    expect(aggregateStatus(["PASSED", "PASSED", "SKIPPED"])).toBe("PASSED");
  });

  it("all PASSED stays PASSED", () => {
    expect(aggregateStatus(["PASSED", "PASSED", "PASSED"])).toBe("PASSED");
  });
});
