import { PrismaClient } from "@prisma/client";
import { writeFileSync } from "fs";

const prisma = new PrismaClient();

async function main() {
  const projects = await prisma.project.findMany({
    where: { key: { in: ["HAPSTER", "HAPSTERLMS"] } },
    include: {
      suites: {
        orderBy: { createdAt: "asc" },
        include: {
          cases: {
            orderBy: { createdAt: "asc" },
            select: {
              title: true,
              priority: true,
              testLevel: true,
              tags: true,
              preconditions: true,
              estimatedMinutes: true,
              requirements: true,
              steps: true,
            },
          },
        },
      },
    },
  });

  const specs = projects
    .sort((a, b) => (a.key === "HAPSTER" ? -1 : 1))
    .map((p) => ({
      key: p.key,
      name: p.name,
      description: p.description,
      suites: p.suites.map((s) => ({
        name: s.name,
        description: s.description,
        cases: s.cases,
      })),
    }));

  const body = `import { PrismaClient, Priority, TestLevel } from "@prisma/client";
import bcrypt from "bcryptjs";

type Step = { action: string; expected: string };
type CaseSpec = {
  title: string;
  priority: Priority;
  testLevel?: TestLevel;
  tags: string[];
  preconditions?: string | null;
  steps: Step[];
  estimatedMinutes?: number | null;
  requirements?: string[];
};
type SuiteSpec = { name: string; description?: string | null; cases: CaseSpec[] };
type ProjectSpec = { key: string; name: string; description: string | null; suites: SuiteSpec[] };

const HAPSTER_PROJECTS: ProjectSpec[] = ${JSON.stringify(specs, null, 2)};

async function upsertUser(prisma: PrismaClient, email: string, name: string, password: string, role: "MANAGER" | "TESTER", companyId: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    if (existing.companyId !== companyId || existing.role !== role) {
      await prisma.user.update({ where: { id: existing.id }, data: { companyId, role, name } });
    }
    return existing;
  }
  return prisma.user.create({
    data: { email, name, passwordHash: await bcrypt.hash(password, 10), role, companyId },
  });
}

async function seedProject(prisma: PrismaClient, spec: ProjectSpec, companyId: string) {
  const existing = await prisma.project.findFirst({ where: { companyId, key: spec.key } });
  if (existing) {
    console.log(\`Seed (hapster): project \${spec.key} already exists, skipping.\`);
    return existing;
  }
  const project = await prisma.project.create({
    data: { companyId, key: spec.key, name: spec.name, description: spec.description ?? undefined },
  });
  for (const suiteSpec of spec.suites) {
    const suite = await prisma.testSuite.create({
      data: { projectId: project.id, name: suiteSpec.name, description: suiteSpec.description ?? undefined },
    });
    for (const c of suiteSpec.cases) {
      await prisma.testCase.create({
        data: {
          suiteId: suite.id,
          title: c.title,
          priority: c.priority,
          testLevel: c.testLevel ?? "REGRESSION",
          tags: c.tags,
          preconditions: c.preconditions ?? undefined,
          steps: c.steps as any,
          estimatedMinutes: c.estimatedMinutes ?? undefined,
          requirements: c.requirements ?? [],
        },
      });
    }
  }
  const caseCount = spec.suites.reduce((n, s) => n + s.cases.length, 0);
  console.log(\`Seed (hapster): created project \${spec.key} (\${spec.suites.length} suites, \${caseCount} cases).\`);
  return project;
}

/**
 * Local-only Hapster seed. Run automatically by prisma/seed.ts when this file
 * is present (it is gitignored so it never ships with the public repo).
 */
export default async function seedHapster(prisma: PrismaClient) {
  const company = await prisma.company.upsert({
    where: { slug: "hapster-inc" },
    update: {},
    create: { name: "Hapster Inc", slug: "hapster-inc" },
  });

  await upsertUser(prisma, "admin@testsuits.local", "Sam Manager", "admin123", "MANAGER", company.id);
  await upsertUser(prisma, "tester@testsuits.local", "Jane Tester", "tester123", "TESTER", company.id);

  for (const spec of HAPSTER_PROJECTS) {
    await seedProject(prisma, spec, company.id);
  }

  console.log("Seed (hapster): Hapster tenant ready (admin@testsuits.local / admin123).");
}
`;

  writeFileSync("/app/prisma/seed.hapster.ts", body);
  const total = specs.reduce((n, p) => n + p.suites.reduce((m, s) => m + s.cases.length, 0), 0);
  console.log(`Wrote seed.hapster.ts with ${specs.length} projects, ${total} cases.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
