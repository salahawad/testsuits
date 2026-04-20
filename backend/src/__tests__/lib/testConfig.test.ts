import { describe, it, expect } from "vitest";
import { DEFAULT_OPTIONS } from "../../lib/testConfig";

describe("DEFAULT_OPTIONS", () => {
  it("covers the three canonical test-config kinds", () => {
    expect(Object.keys(DEFAULT_OPTIONS).sort()).toEqual([
      "CONNECTIVITY",
      "LOCALE",
      "PLATFORM",
    ]);
  });

  it("ships the four seed platforms with stable codes", () => {
    const codes = DEFAULT_OPTIONS.PLATFORM.map((o) => o.code);
    expect(codes).toEqual(["WEB", "WINDOWS", "ANDROID", "IOS"]);
  });

  it("ships the two seed connectivities", () => {
    const codes = DEFAULT_OPTIONS.CONNECTIVITY.map((o) => o.code);
    expect(codes).toEqual(["ONLINE", "OFFLINE"]);
  });

  it("ships the six supported locales", () => {
    const codes = DEFAULT_OPTIONS.LOCALE.map((o) => o.code);
    expect(codes).toEqual(["en", "fr", "es", "pl", "hu", "de"]);
  });

  it("never contains duplicate codes within a kind", () => {
    for (const [kind, opts] of Object.entries(DEFAULT_OPTIONS)) {
      const codes = opts.map((o) => o.code);
      const set = new Set(codes);
      expect(set.size, `duplicates in ${kind}`).toBe(codes.length);
    }
  });

  it("gives every option a non-empty label", () => {
    for (const opts of Object.values(DEFAULT_OPTIONS)) {
      for (const o of opts) {
        expect(o.label.length).toBeGreaterThan(0);
      }
    }
  });
});
