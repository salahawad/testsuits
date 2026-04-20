import { describe, it, expect, vi, beforeEach } from "vitest";
import { apiErrorMessage } from "../../lib/apiError";
import i18n from "../../i18n";

function axiosErr(data: unknown) {
  return {
    isAxiosError: true,
    response: { data },
  } as const;
}

describe("apiErrorMessage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the fallback when err is falsy", () => {
    expect(apiErrorMessage(null, "fallback")).toBe("fallback");
    expect(apiErrorMessage(undefined, "fallback")).toBe("fallback");
  });

  it("prefers the first fieldErrors entry with 'field: message' format", () => {
    const err = axiosErr({
      error: "VALIDATION_FAILED",
      details: {
        formErrors: [],
        fieldErrors: { email: ["Invalid address"], name: ["Required"] },
      },
    });
    expect(apiErrorMessage(err, "fallback")).toBe("email: Invalid address");
  });

  it("skips empty field-error arrays", () => {
    const err = axiosErr({
      details: {
        formErrors: ["Top-level problem"],
        fieldErrors: { email: [], name: ["Required"] },
      },
    });
    expect(apiErrorMessage(err, "fallback")).toBe("name: Required");
  });

  it("falls back to the first formErrors entry", () => {
    const err = axiosErr({
      details: {
        formErrors: ["Something went wrong"],
      },
    });
    expect(apiErrorMessage(err, "fallback")).toBe("Something went wrong");
  });

  it("translates an UPPER_SNAKE_CASE machine key when i18n has it", () => {
    vi.spyOn(i18n, "t").mockImplementation(
      ((key: string) =>
        key === "errors.PROJECT_NOT_FOUND"
          ? "Project not found"
          : key) as typeof i18n.t,
    );
    const err = axiosErr({ error: "PROJECT_NOT_FOUND" });
    expect(apiErrorMessage(err, "fallback")).toBe("Project not found");
  });

  it("returns the raw machine key when i18n has no translation", () => {
    vi.spyOn(i18n, "t").mockImplementation(
      ((key: string) => key) as typeof i18n.t,
    );
    const err = axiosErr({ error: "UNKNOWN_BACKEND_KEY" });
    expect(apiErrorMessage(err, "fallback")).toBe("UNKNOWN_BACKEND_KEY");
  });

  it("returns a raw string if error is not a machine key", () => {
    const err = axiosErr({ error: "something bad" });
    expect(apiErrorMessage(err, "fallback")).toBe("something bad");
  });

  it("falls back to Error.message for a plain Error", () => {
    expect(apiErrorMessage(new Error("network down"), "fallback")).toBe(
      "network down",
    );
  });

  it("uses the fallback when nothing else is available", () => {
    expect(apiErrorMessage({ response: { data: {} } }, "fallback")).toBe(
      "fallback",
    );
  });
});
