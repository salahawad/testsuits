// Vitest global setup. Runs once before any test file is loaded. We set
// LOG_LEVEL silent here (not in the npm script) so developers can still
// override it when debugging a specific test, and we guard DATABASE_URL so
// tests never accidentally chew the development database.
//
// Pure unit tests (the bulk of the suite) never touch Prisma, so we allow
// DATABASE_URL to be absent — in that mode we only block an explicit non-test
// URL. Integration tests set DATABASE_URL to the `testsuits_test` database via
// the npm script.

if (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("testsuits_test")) {
  throw new Error(
    "DATABASE_URL is set but does not point at the test database (testsuits_test). Unset it or point it at the test DB before running tests.",
  );
}

process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? "silent";
process.env.JWT_SECRET = process.env.JWT_SECRET ?? "test-secret-only-for-integration-tests";
process.env.NODE_ENV = "test";
