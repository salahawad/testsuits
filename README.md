# TestSuits — Modern Test Management System

A self-hosted test management platform for manual functional QA. Organise projects, run test suites, track executions, link defects to Jira, and store evidence in MinIO — a lightweight, Docker-Compose alternative to TestRail / Zephyr / qTest.

- **Multi-tenant** — every object is scoped to a Company; cross-tenant access is blocked at the API layer.
- **Jira integration** — Jira credentials are configured once per company; each project picks which Jira project to file bugs into. `Create Jira bug` on a failed execution only enables when the execution's project has a Jira binding and the company has Jira credentials saved.
- **Evidence storage** — upload screenshots, videos and logs against cases or executions.
- **Full activity log** — per-project event stream with filters.
- **CSV export** of run results, API tokens for CI integration.
- **Roles** — `MANAGER` sees everything in the company; `TESTER` sees only runs/executions they own, created, or are assigned to. Both roles can execute tests and assign executions to any teammate.
- **i18n** — English and French built in with a language switcher; sidebar collapses for more canvas.

## Stack

| Layer             | Tech                                                              |
| ----------------- | ----------------------------------------------------------------- |
| Frontend          | React 18, Vite, TypeScript, Tailwind, TanStack Query, Zustand     |
| Backend           | Node.js 20, Express, TypeScript, Prisma, Zod, JWT auth            |
| Database          | PostgreSQL 16                                                     |
| Object storage    | MinIO (S3-compatible)                                             |
| Drag-and-drop     | dnd-kit (for reorderable test steps)                              |
| Orchestration     | Docker Compose                                                    |

## Prerequisites

- Docker 24+ with Docker Compose v2
- That's it — everything else runs inside containers.

## Quick start

```bash
git clone https://github.com/<your-org>/testsuits.git
cd testsuits
cp .env.example .env
docker compose up --build
```

On first boot the API container runs `prisma db push` to create the schema and `prisma db seed` to insert the generic demo data. Open:

| Service        | URL                                         |
| -------------- | ------------------------------------------- |
| Web UI         | http://localhost:5173                       |
| API            | http://localhost:4000/api                   |
| MinIO console  | http://localhost:9005 (minioadmin/minioadmin) |
| Postgres       | localhost:5434 (user/pass: `testsuits`)     |

### Seeded accounts

The seed creates two isolated tenants so you can verify cross-company isolation immediately:

| Tenant                    | Email                         | Password   | Role    |
| ------------------------- | ----------------------------- | ---------- | ------- |
| Acme QA (primary demo)    | `manager@acme.local`          | `acme123`  | MANAGER |
| Acme QA                   | `tester@acme.local`           | `acme123`  | TESTER  |
| Globex QA (isolation test)| `manager@globex.local`        | `globex123`| MANAGER |
| Globex QA                 | `tester@globex.local`         | `globex123`| TESTER  |

The Acme tenant ships with two projects:

- **Acme Checkout** — 3 suites (Cart, Payment, Shipping), 10 cases, 2 milestones, 4 runs covering smoke / full regression / offline / localisation, a failing execution linked to a sample Jira key, comments, activity-log entries, API token, and attachment metadata.
- **Acme Customer Portal** — 2 suites (Account, Orders), 5 cases, 1 milestone, 1 smoke run with a failing profile-update execution.

The Globex tenant has a single project (`BILLING`) with a small run so the isolation test is still useful: log in as a Globex user and confirm you can't see Acme's data, then check that Globex's own project still renders on every page.

## Configuration

All runtime configuration is controlled by `.env`. Copy `.env.example` and tweak as needed.

### Required

| Variable           | Purpose                                                   |
| ------------------ | --------------------------------------------------------- |
| `POSTGRES_USER`    | Postgres superuser (created on first boot)                |
| `POSTGRES_PASSWORD`| Postgres password                                         |
| `POSTGRES_DB`      | Database name                                             |
| `DATABASE_URL`     | Prisma connection string (uses the three vars above)      |
| `JWT_SECRET`       | Signing secret for JWTs — **set a strong value for prod** |
| `API_PORT`         | Port the Express API listens on (inside the container)    |
| `WEB_PORT`         | Port the Vite dev server listens on                       |
| `VITE_API_URL`     | URL the **browser** uses to reach the API                 |

### Host port overrides

Change these if the defaults collide with something else on your host:

| Variable                  | Default | Maps to                             |
| ------------------------- | ------- | ----------------------------------- |
| `POSTGRES_HOST_PORT`      | `5434`  | Postgres `5432` inside the container |
| `MINIO_HOST_PORT`         | `9004`  | MinIO S3 API `9000`                 |
| `MINIO_CONSOLE_HOST_PORT` | `9005`  | MinIO web console `9001`            |

### Object storage (MinIO)

| Variable              | Purpose                                                                   |
| --------------------- | ------------------------------------------------------------------------- |
| `MINIO_ROOT_USER`     | MinIO admin user                                                          |
| `MINIO_ROOT_PASSWORD` | MinIO admin password                                                      |
| `MINIO_BUCKET`        | Bucket name (created automatically by the `minio-init` service)           |
| `S3_PUBLIC_ENDPOINT`  | URL the **browser** uses for signed downloads (host + `MINIO_HOST_PORT`)  |

### Optional: auto-configure Jira

Set these to have the seed attach a `JiraConfig` to the Acme tenant on first boot. `JIRA_PROJECT_KEY`, if present, is bound to the `CHECKOUT` project so the per-project targeting is ready-to-go too. Omit these to configure Jira through the UI instead (Company Settings → Jira, then Project Settings → Jira binding).

```env
JIRA_BASE_URL=https://your-org.atlassian.net
JIRA_USER=you@example.com
JIRA_TOKEN=your-atlassian-api-token
JIRA_PROJECT_KEY=PROJ
```

API tokens: [id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens).

## Working with the app

### Accessing from another device on your LAN

`VITE_API_URL` and `S3_PUBLIC_ENDPOINT` are URLs **the browser** resolves. When you open the UI from another machine, replace `localhost` with your host's LAN address, e.g.:

```env
VITE_API_URL=http://192.168.1.20:4000/api
S3_PUBLIC_ENDPOINT=http://192.168.1.20:9004
```

Then restart: `docker compose up -d --build web`.

### Re-seeding / resetting

Wipe everything and start from scratch:

```bash
docker compose down -v   # -v removes the postgres-data and minio-data volumes
docker compose up --build
```

Run just the seed against an already-running stack:

```bash
docker compose exec api npx tsx prisma/seed.ts
```

The seed is idempotent — rows that already exist are skipped.

### Resetting a single tenant's demo

Log in as a manager, delete the project from the UI, then re-run the seed; it will re-create just the missing pieces.

## Configuring Jira from the UI

Jira is split across two screens: credentials + templates live at the **company** level (they're reused by every project in the tenant), and the target Jira project lives on each **project**.

### 1. Company-level credentials (once per tenant)

1. Log in as a manager.
2. Open **Company Settings → Jira**.
3. Fill in:
   - **Base URL** (e.g. `https://acme.atlassian.net`)
   - **Email** (the owner of the API token)
   - **API token** — create at [id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens)
   - **Default issue type** (default: `Bug`)
   - Optional: summary / description templates used when filing bugs
4. **Test connection** → **Save**.

### 2. Per-project binding (once per project)

1. Open the project → **Settings → Jira**.
2. Pick the **Jira project** to file bugs into (the dropdown lists projects discovered via the company's saved credentials).
3. Optionally override the issue type and pick a parent epic.
4. **Save**.

### 3. Filing bugs

On a failed execution, click **Create Jira bug**. The defect is filed with the full test context (steps, failure reason, tester, environment, run name) and linked back to the execution. The button is only enabled when the company has Jira credentials saved **and** the execution's project has a Jira binding.

## Domain model

```
Company
  ├── Users (MANAGER / TESTER)
  │     ├── owned TestRuns
  │     ├── assigned TestExecutions
  │     ├── Comments
  │     ├── ActivityLog entries
  │     └── ApiTokens
  ├── JiraConfig (optional, 1 per company — credentials + templates)
  └── Projects
        ├── jiraProjectKey / jiraIssueType / jiraParentEpicKey (per-project target)
        ├── Milestones
        ├── TestSuites (tree — suites can have sub-suites)
        │     └── TestCases
        │           ├── steps (ordered JSON array, drag-to-reorder in the UI)
        │           ├── tags, priority, testLevel
        │           ├── Attachments
        │           └── Comments
        └── TestRuns
              ├── Milestone (optional)
              ├── environment, platform, connectivity, locale, dueDate
              └── TestExecutions
                    ├── status (PENDING/PASSED/FAILED/BLOCKED/SKIPPED)
                    ├── failureReason, actualResult, durationMinutes
                    ├── assignee
                    ├── jiraIssueKey / jiraIssueUrl
                    ├── Attachments
                    └── Comments
```

Enums: `Role` (`MANAGER`, `TESTER`), `Priority` (`LOW`/`MEDIUM`/`HIGH`/`CRITICAL`), `TestLevel` (`SMOKE`/`SANITY`/`REGRESSION`/`ADVANCED`/`EXPLORATORY`), `Platform` (`WEB`/`WINDOWS`/`MACOS`/`ANDROID`/`IOS`), `Connectivity` (`ONLINE`/`OFFLINE`).

### Role capabilities

| Action                                              | MANAGER       | TESTER                                    |
| --------------------------------------------------- | ------------- | ----------------------------------------- |
| View projects, suites, cases, milestones            | ✔ (all)       | ✔ (all)                                   |
| View runs & executions                              | ✔ (all)       | only those they created or are assigned to |
| Create/edit projects, suites, cases, milestones     | ✔             | —                                         |
| Create test runs                                    | ✔             | —                                         |
| Execute tests (status, notes, duration, failure)    | ✔             | ✔                                         |
| Assign / reassign executions (single & bulk)        | ✔             | ✔                                         |
| Add / remove / change roles of teammates            | ✔             | —                                         |
| Company Jira credentials + templates                | ✔             | view only                                 |
| Per-project Jira binding (target project, epic)     | ✔             | view only                                 |
| Create / link / unlink Jira issues on executions    | ✔             | ✔ (within their visible work)             |

## Folder layout

```
backend/
  prisma/
    schema.prisma      Data model
    seed.ts            Generic demo seed (shipped publicly)
    seed.hapster.ts    Local-only seed extension (gitignored — optional)
    migrations/        Generated Prisma migrations
  src/
    app.ts             Express setup + router mounting
    db.ts              Prisma client
    middleware/        auth, scope, error
    lib/               s3, jira, logger, activity
    routes/            auth, projects, suites, cases, runs, executions,
                       attachments, dashboard, jira, milestones,
                       comments, users, activity
  src/
    app.ts             Express setup + router mounting
    db.ts              Prisma client
    middleware/        auth, scope (tenant + tester visibility), logging, error
    lib/               s3, jira (discover + md→ADF), logger, activity
    routes/            auth, users, companies, projects, suites, cases,
                       milestones, runs, executions, attachments, comments,
                       activity, dashboard, matrix, jira
frontend/
  src/
    App.tsx            Router
    i18n/              en.json, fr.json — kept in sync (see CLAUDE.md)
    lib/               api, auth, status, logger, enums
    components/        Layout (collapsible, company header), Comments,
                       ActivityFeed, LanguageSwitcher
    pages/             Login, Dashboard, Projects, ProjectDetail,
                       CompanySettings (company Jira creds + templates),
                       ProjectSettings (per-project Jira binding),
                       Team, Milestones, Matrix (coverage by platform /
                       connectivity / locale),
                       SuiteDetail, CaseDetail, Runs, RunDetail
docker-compose.yml     postgres + minio + minio-init + api + web
```

## Local development

Docker is the recommended path. If you want to run the services natively (e.g. for faster hot-reload on the backend), point your local Node.js 20 at the Postgres and MinIO containers:

```bash
# One-time
cd backend && npm install
cd ../frontend && npm install

# Backend (reads DATABASE_URL from .env)
cd backend
npx prisma generate
npm run dev

# Frontend
cd ../frontend
npm run dev
```

You can still run just Postgres + MinIO in Docker:

```bash
docker compose up -d db minio minio-init
```

### Extending the seed with local fixtures

`prisma/seed.ts` automatically loads `prisma/seed.hapster.ts` if the file is present. That filename is gitignored, as is anything matching `seed.*.local.ts`. Export a default async function:

```ts
// backend/prisma/seed.hapster.ts
import { PrismaClient } from "@prisma/client";

export default async function (prisma: PrismaClient) {
  // create your internal tenant, users, projects, etc.
}
```

Run it:

```bash
docker compose exec api npx tsx prisma/seed.ts
```

## API surface (high level)

All routes live under `/api`. JWT auth is required except `POST /api/auth/login` and `POST /api/auth/signup` (signup creates a new Company and makes the caller its first manager — there is no super-admin). Every authenticated route is scoped to the caller's company; cross-tenant reads return 404 (not 403) so existence is never leaked.

| Area              | Routes                                                                                                          |
| ----------------- | --------------------------------------------------------------------------------------------------------------- |
| Auth              | `POST /auth/login`, `POST /auth/signup`                                                                         |
| Users             | `GET /users`, `GET /users/me`, `POST /users` (mgr), `PATCH/DELETE /users/:id` (mgr)                             |
| Companies         | `GET /companies/current`, `PATCH /companies/current` (mgr)                                                      |
| Projects          | `GET /projects`, `POST /projects` (mgr), `GET/PATCH/DELETE /projects/:id`                                       |
| Suites            | `POST /suites` (mgr), `GET/PATCH/DELETE /suites/:id`                                                             |
| Cases             | `POST /cases` (mgr), `GET /cases/:id`, `PATCH/DELETE /cases/:id` (mgr), `POST /cases/:id/clone` (mgr)            |
| Milestones        | `GET /milestones`, `POST /milestones` (mgr), `PATCH/DELETE /milestones/:id` (mgr)                                |
| Runs              | `GET /runs`, `POST /runs` (mgr), `GET/PATCH/DELETE /runs/:id`, `GET /runs/:id/export.csv`                        |
| Executions        | `GET /executions/:id`, `PATCH /executions/:id`, `POST /executions/bulk-assign`                                   |
| Attachments       | `POST /attachments` (multipart), `GET /attachments/:id/download`, `DELETE /attachments/:id`                      |
| Comments          | `GET /comments?caseId\|executionId\|runId=…`, `POST /comments`, `DELETE /comments/:id`                           |
| Jira (company)    | `GET/PUT/DELETE /jira/config` (PUT/DELETE mgr), `POST /jira/test`, `GET /jira/defaults/templates`                |
| Jira (discover)   | `GET /jira/discover/projects`, `/jira/discover/issue-types`, `/jira/discover/epics`                              |
| Jira (project)    | `GET /jira/projects/:id/binding`, `PUT /jira/projects/:id/binding` (mgr)                                         |
| Jira (bugs)       | `POST /jira/executions/:id/create-bug`, `POST /jira/executions/:id/link`, `POST /jira/executions/:id/unlink`     |
| Matrix            | `GET /matrix/projects/:id?dimension=platform\|connectivity\|locale`                                              |
| Activity          | `GET /activity?projectId=…&entityType=…&entityId=…`                                                              |
| Dashboard         | `GET /dashboard`                                                                                                 |

`(mgr)` = manager-only.

## Security notes

- JWTs are signed with `JWT_SECRET` — rotate this in production.
- Attachments are stored privately in MinIO; downloads go through signed URLs served by `S3_PUBLIC_ENDPOINT`.
- `.env` is gitignored by default. Never commit a populated `.env` or `seed.hapster.ts`.
- All multi-tenant reads are scoped by `companyId` at the query level (see `backend/src/middleware/scope.ts`).

## Troubleshooting

- **"Failed to resolve import @dnd-kit/core"** — run `docker compose up -d --build web`. The web image bakes `node_modules` at build time; adding a dependency requires rebuilding.
- **Browser can't reach the API from another device** — set `VITE_API_URL` to your host's LAN IP (not `localhost`) and rebuild the web container.
- **Signed download URLs fail** — `S3_PUBLIC_ENDPOINT` must be the URL the **browser** can hit (host IP + `MINIO_HOST_PORT`), not the in-Docker MinIO address.
- **Port already in use** — override the corresponding `*_HOST_PORT` in `.env`.
- **Seed did nothing on a fresh DB** — check `docker compose logs api | grep Seed`. Every seed step logs either "created" or "skipping".

## Roadmap

- Requirements / user stories as first-class objects (bidirectional tracing)
- Custom fields per project
- Shared / reusable test steps
- Rich-text editor for preconditions and steps
- Webhook notifications on failure
- Playwright / Cypress reporter packages
- Traceability matrix report
- Test case versioning / history diff
- Kanban board view for runs

## License

MIT — see `LICENSE` if present, otherwise pick one before publishing publicly.
