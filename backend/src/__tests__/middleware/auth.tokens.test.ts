import { describe, it, expect, beforeAll } from "vitest";
import jwt from "jsonwebtoken";

// Lock the secret BEFORE the module loads — the SECRET is captured at import
// time from process.env.JWT_SECRET.
beforeAll(() => {
  process.env.JWT_SECRET = "unit-test-secret-do-not-use-in-prod";
});

// Dynamic import so beforeAll's env mutation is visible to the module.
async function loadAuth() {
  return await import("../../middleware/auth");
}

describe("hashApiToken", () => {
  it("returns a deterministic sha256 hex digest", async () => {
    const { hashApiToken } = await loadAuth();
    const h1 = hashApiToken("ts_abc123");
    const h2 = hashApiToken("ts_abc123");
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64); // sha256 hex
    expect(h1).toMatch(/^[a-f0-9]+$/);
  });

  it("produces different digests for different inputs", async () => {
    const { hashApiToken } = await loadAuth();
    expect(hashApiToken("a")).not.toBe(hashApiToken("b"));
  });
});

describe("signToken / verify", () => {
  it("signs a JWT that round-trips the user payload", async () => {
    const { signToken } = await loadAuth();
    const token = signToken({
      id: "u1",
      email: "u@x.com",
      role: "MANAGER",
      companyId: "c1",
    });
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
      id: string;
      email: string;
      role: string;
      companyId: string;
      exp: number;
      iat: number;
    };
    expect(decoded.id).toBe("u1");
    expect(decoded.email).toBe("u@x.com");
    expect(decoded.role).toBe("MANAGER");
    expect(decoded.companyId).toBe("c1");
    expect(decoded.exp).toBeGreaterThan(decoded.iat);
  });

  it("rememberMe extends expiry to ~30d vs default ~24h", async () => {
    const { signToken } = await loadAuth();
    const short = jwt.decode(
      signToken(
        { id: "u", email: "u@x.com", role: "TESTER", companyId: "c" },
        { rememberMe: false },
      ),
    ) as { exp: number; iat: number };
    const long = jwt.decode(
      signToken(
        { id: "u", email: "u@x.com", role: "TESTER", companyId: "c" },
        { rememberMe: true },
      ),
    ) as { exp: number; iat: number };
    const shortTtl = short.exp - short.iat;
    const longTtl = long.exp - long.iat;
    // 24h == 86_400s, 30d == 2_592_000s — verify the ratio, not absolute values.
    expect(longTtl).toBeGreaterThan(shortTtl * 10);
  });
});

describe("2FA challenge tokens", () => {
  it("signs and verifies a valid challenge token", async () => {
    const { signChallengeToken, verifyChallengeToken } = await loadAuth();
    const token = signChallengeToken("user-42");
    expect(verifyChallengeToken(token)).toBe("user-42");
  });

  it("rejects a token with the wrong purpose", async () => {
    const { verifyChallengeToken } = await loadAuth();
    const impostor = jwt.sign(
      { sub: "user-42", purpose: "login" },
      process.env.JWT_SECRET!,
      { expiresIn: "5m" },
    );
    expect(() => verifyChallengeToken(impostor)).toThrow();
  });

  it("rejects a token with no subject", async () => {
    const { verifyChallengeToken } = await loadAuth();
    const impostor = jwt.sign({ purpose: "2fa" }, process.env.JWT_SECRET!, {
      expiresIn: "5m",
    });
    expect(() => verifyChallengeToken(impostor)).toThrow();
  });

  it("rejects a token signed with the wrong secret", async () => {
    const { verifyChallengeToken } = await loadAuth();
    const impostor = jwt.sign(
      { sub: "user-42", purpose: "2fa" },
      "other-secret",
      { expiresIn: "5m" },
    );
    expect(() => verifyChallengeToken(impostor)).toThrow();
  });
});
