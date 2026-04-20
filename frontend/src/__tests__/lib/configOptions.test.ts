import { describe, it, expect } from "vitest";
import { activeOf, makeLabelLookup, type ConfigOption } from "../../lib/configOptions";

const opts: ConfigOption[] = [
  { id: "1", kind: "PLATFORM", code: "WEB", label: "Web", sortOrder: 0, deletedAt: null },
  { id: "2", kind: "PLATFORM", code: "IOS", label: "iOS", sortOrder: 1, deletedAt: null },
  { id: "3", kind: "PLATFORM", code: "OLD", label: "Old", sortOrder: 2, deletedAt: "2026-01-01" },
  { id: "4", kind: "LOCALE", code: "en", label: "English", sortOrder: 0, deletedAt: null },
  { id: "5", kind: "CONNECTIVITY", code: "ONLINE", label: "Online", sortOrder: 0, deletedAt: null },
];

describe("activeOf", () => {
  it("returns active options for the requested kind", () => {
    const result = activeOf(opts, "PLATFORM");
    expect(result.map((o) => o.code)).toEqual(["WEB", "IOS"]);
  });

  it("excludes soft-deleted options", () => {
    const result = activeOf(opts, "PLATFORM");
    expect(result.find((o) => o.code === "OLD")).toBeUndefined();
  });

  it("filters by kind", () => {
    expect(activeOf(opts, "LOCALE")).toHaveLength(1);
    expect(activeOf(opts, "CONNECTIVITY")).toHaveLength(1);
  });

  it("handles undefined input gracefully", () => {
    expect(activeOf(undefined, "PLATFORM")).toEqual([]);
  });
});

describe("makeLabelLookup", () => {
  it("returns the label for a known active code", () => {
    const lookup = makeLabelLookup(opts, "PLATFORM");
    expect(lookup("WEB")).toBe("Web");
  });

  it("returns the label even for soft-deleted codes (historical runs)", () => {
    const lookup = makeLabelLookup(opts, "PLATFORM");
    expect(lookup("OLD")).toBe("Old");
  });

  it("falls back to the code itself when missing entirely", () => {
    const lookup = makeLabelLookup(opts, "PLATFORM");
    expect(lookup("UNKNOWN")).toBe("UNKNOWN");
  });

  it("returns empty string for null / undefined / empty code", () => {
    const lookup = makeLabelLookup(opts, "PLATFORM");
    expect(lookup(null)).toBe("");
    expect(lookup(undefined)).toBe("");
    expect(lookup("")).toBe("");
  });

  it("isolates lookups by kind — LOCALE codes don't leak into PLATFORM", () => {
    const platform = makeLabelLookup(opts, "PLATFORM");
    expect(platform("en")).toBe("en"); // fallback: not a PLATFORM
  });

  it("handles undefined options list", () => {
    const lookup = makeLabelLookup(undefined, "PLATFORM");
    expect(lookup("WEB")).toBe("WEB");
  });
});
