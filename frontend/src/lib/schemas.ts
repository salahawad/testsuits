import { z } from "zod";

// Shared client-side schemas. Server-side zod schemas live in backend/src/routes
// and are the ultimate source of truth; these mirror the important ones so the
// client can give inline feedback without a round-trip.

// Keep in sync with backend/src/routes/auth.ts passwordPolicy.
const COMMON_PASSWORDS = new Set<string>([
  "password", "password1", "password123", "p@ssw0rd", "passw0rd",
  "123456", "1234567", "12345678", "123456789", "1234567890",
  "qwerty", "qwertyui", "qwertyuiop", "asdfgh", "asdfghjkl",
  "abc123", "abcd1234", "iloveyou", "letmein", "welcome",
  "admin", "admin123", "administrator", "root", "root1234",
  "monkey", "dragon", "football", "baseball", "sunshine",
  "changeme", "default", "temp1234", "hello123", "testtest",
]);

export const passwordPolicy = z
  .string()
  .min(10, "Password must be at least 10 characters")
  .max(128, "Password must be at most 128 characters")
  .refine((p) => !COMMON_PASSWORDS.has(p.toLowerCase()), "That password is too common. Pick a less obvious one.");

// Login passwords aren't re-validated for strength — legacy short passwords
// from pre-policy accounts should still work.
export const loginPassword = z.string().min(1, "Password is required");

export const emailField = z.string().min(1, "Email is required").email("Enter a valid email");
export const nonEmpty = (label: string) => z.string().min(1, `${label} is required`);
export const optionalString = z.string().optional();

export const roleEnum = z.enum(["ADMIN", "MANAGER", "TESTER", "VIEWER"]);
