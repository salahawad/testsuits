import { describe, it, expect } from "vitest";
import {
  passwordPolicy,
  passwordPolicyWithMessages,
  loginPassword,
  emailField,
  emailFieldWithMessages,
  nonEmpty,
  roleEnum,
} from "../../lib/schemas";

const t = (key: string) => key; // stand-in i18n

describe("passwordPolicy", () => {
  it("accepts passwords of 10 chars or more", () => {
    expect(passwordPolicy.safeParse("abcdefghij").success).toBe(true);
    expect(passwordPolicy.safeParse("x".repeat(128)).success).toBe(true);
  });

  it("rejects passwords shorter than 10", () => {
    expect(passwordPolicy.safeParse("short").success).toBe(false);
  });

  it("rejects passwords longer than 128", () => {
    expect(passwordPolicy.safeParse("x".repeat(129)).success).toBe(false);
  });
});

describe("passwordPolicyWithMessages", () => {
  const schema = passwordPolicyWithMessages(t);

  it("rejects common passwords case-insensitively (when length passes)", () => {
    expect(schema.safeParse("Password123").success).toBe(false);
    expect(schema.safeParse("PASSWORD123").success).toBe(false);
    // Pad a common password up to 10 chars so the length check passes and
    // the refine (common-password check) fires.
    expect(schema.safeParse("letmein123").success).toBe(true); // not in the common list — OK
    expect(schema.safeParse("admin12345").success).toBe(true); // "admin" alone is blocked, this is not
  });

  it("rejects an exact-match common password padded to the minimum length", () => {
    // 'password123' is in the common set and is exactly 11 chars
    expect(schema.safeParse("password123").success).toBe(false);
  });

  it("accepts a strong, uncommon 10+ char password", () => {
    expect(schema.safeParse("jX9#vp!mqZ").success).toBe(true);
  });

  it("returns the translation key in the error", () => {
    const r = schema.safeParse("short");
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toBe("validation.password_min");
    }
  });
});

describe("loginPassword", () => {
  it("accepts any non-empty password (legacy accounts)", () => {
    expect(loginPassword.safeParse("x").success).toBe(true);
    expect(loginPassword.safeParse("legacy").success).toBe(true);
  });

  it("rejects empty strings", () => {
    expect(loginPassword.safeParse("").success).toBe(false);
  });
});

describe("emailField", () => {
  it("accepts a well-formed email", () => {
    expect(emailField.safeParse("user@example.com").success).toBe(true);
  });

  it.each(["", "not-an-email", "a@", "@b.com", "a b@c.com"])(
    "rejects invalid address %s",
    (bad) => {
      expect(emailField.safeParse(bad).success).toBe(false);
    },
  );
});

describe("emailFieldWithMessages", () => {
  const schema = emailFieldWithMessages(t);

  it("distinguishes required vs invalid", () => {
    expect(schema.safeParse("").error?.issues[0].message).toBe(
      "validation.email_required",
    );
    expect(schema.safeParse("nope").error?.issues[0].message).toBe(
      "validation.email_invalid",
    );
  });
});

describe("nonEmpty", () => {
  it("produces a labelled required message", () => {
    const r = nonEmpty("Project name").safeParse("");
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toBe("Project name is required");
    }
  });
});

describe("roleEnum", () => {
  it.each(["ADMIN", "MANAGER", "TESTER", "VIEWER"] as const)(
    "accepts %s",
    (r) => {
      expect(roleEnum.safeParse(r).success).toBe(true);
    },
  );

  it("rejects unknown roles", () => {
    expect(roleEnum.safeParse("OWNER").success).toBe(false);
    expect(roleEnum.safeParse("").success).toBe(false);
  });
});
