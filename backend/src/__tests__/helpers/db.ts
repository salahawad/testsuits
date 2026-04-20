import { prisma } from "../../db";

// Table order matters for FK-free truncation but using `TRUNCATE ... CASCADE`
// lets us wipe everything in one call. Keep this list in sync with schema.prisma
// — any new table that holds test-visible state should go here.
const TABLES = [
  "WebhookDelivery",
  "Webhook",
  "SharedStep",
  "ActivityLog",
  "Comment",
  "Attachment",
  "TestExecutionResult",
  "TestExecution",
  "TestRun",
  "TestCaseRevision",
  "TestCase",
  "TestSuite",
  "Milestone",
  "Requirement",
  "JiraConfig",
  "Project",
  "ApiToken",
  "InviteToken",
  "TrustedDevice",
  "EmailVerificationToken",
  "PasswordResetToken",
  "ScimToken",
  "SamlConfig",
  "TestConfigOption",
  "User",
  "Company",
];

export async function resetDb() {
  const list = TABLES.map((t) => `"${t}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

export async function disconnect() {
  await prisma.$disconnect();
}
