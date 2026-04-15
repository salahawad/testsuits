# CLAUDE.md — engineering rules for this repo

These rules apply to **every** change Claude makes to this codebase (or any developer working alongside Claude). They exist so that features ship with proper observability and localization from day one — not as an afterthought.

## 1. Production-grade logging is mandatory

**Every meaningful event must produce a structured log.** Never use bare `console.log` / `console.error` in committed code.

### Backend (`backend/`)

- Use the shared logger at [backend/src/lib/logger.ts](backend/src/lib/logger.ts) (pino). In request handlers, prefer `req.log` (added by pino-http) so logs inherit the request id and user context.
- When you add or modify a route:
  - Log `info` at successful completion of non-trivial actions (auth, Jira calls, file uploads, bulk operations, data mutations that matter).
  - Log `warn` for handled business failures (401/403/404/409, validation).
  - Log `error` for unexpected failures, external-service errors, or any `catch` that isn't a no-op.
  - Always include **structured context** (userId, projectId, runId, entity id) — never string-concat into the message.
- When you call an external service (Jira, S3/MinIO, SMTP, etc.), wrap it with logs on both the request intent and the result (`info` on success, `error` with status/body on failure). Never let an external call fail silently.
- The error middleware logs 4xx as `warn` and 5xx as `error`. Do not duplicate that at the call site — but do add domain context where the middleware can't see it.
- Sensitive fields (`password`, `passwordHash`, `apiToken`, `token`, `jwt`, auth headers) are auto-redacted by the logger. If you introduce a new secret-bearing field, extend `redact.paths` in [logger.ts](backend/src/lib/logger.ts).

### Frontend (`frontend/`)

- Use the logger at [frontend/src/lib/logger.ts](frontend/src/lib/logger.ts). It levels logs, formats them, and ships errors via `navigator.sendBeacon` in production.
- `logger.info` at the success of user-initiated flows that cross the network (login, create, delete, upload, language change).
- `logger.warn` when a network request fails expectedly (auth error, validation).
- `logger.error` in any unexpected `catch`, and on React error boundaries.
- `window.onerror` and `unhandledrejection` are already wired to `logger.error`.
- Never leave a stray `console.log` in committed code.

### Checklist before marking a task done

- [ ] Every new endpoint, mutation, external call, and error path has a structured log with context.
- [ ] Sensitive fields are not logged (check new fields against the redact list).
- [ ] No `console.log` / `console.error` were introduced.

## 2. i18n is mandatory for user-facing text

Supported languages: **English (`en`)** and **French (`fr`)**. Both must stay in sync — a missing French key is a bug.

### Frontend

- All user-facing strings go through `useTranslation()` → `t('key.path')`. No hard-coded English.
- When you add or change a string:
  1. Add the key to [frontend/src/i18n/en.json](frontend/src/i18n/en.json).
  2. Add the **same key** with a French translation to [frontend/src/i18n/fr.json](frontend/src/i18n/fr.json).
  3. Use `{{variable}}` interpolation — never string-concatenation inside `t()`.
- Organise keys by feature area (`runs.*`, `cases.*`, `jira.*`). Keep the structure mirror-identical between `en.json` and `fr.json`.
- The language switcher lives in [LanguageSwitcher.tsx](frontend/src/components/LanguageSwitcher.tsx); don't duplicate it — reuse it.
- Numeric/date formatting: use `Intl.NumberFormat` / `Intl.DateTimeFormat` with the current `i18n.resolvedLanguage`.

### Backend

- API error messages that reach the user should prefer stable machine keys, not prose. The frontend translates them.
- Currently the API returns plain English for system/validation errors (acceptable because they are usually developer-facing). If you add a user-visible domain error, emit a stable `code` field alongside `error` so the frontend can translate it.

### Checklist before marking a task done

- [ ] Every new user-visible string is in **both** `en.json` and `fr.json`.
- [ ] No hard-coded English/French in `.tsx` files.
- [ ] The key structures in both JSON files are identical (same paths, same types).
- [ ] Pluralization and variable substitution use i18next features, not string concatenation.

## 3. Keep README.md in sync with the code

The README is the contract for anyone cloning this repo — **if the code changes in a way a reader would notice, the README changes in the same commit**. Treat this the same way as logging and i18n: non-negotiable, not an afterthought.

### What triggers a README update

Update [README.md](README.md) when you:

- **Add / remove / rename an HTTP route** → update the *API surface* table and the role-gate markers (`(mgr)`, etc.).
- **Add / remove / rename a Prisma model or field, or change an enum** → update the *Domain model* block and the *Enums* line.
- **Change role permissions** → update the *Role capabilities* table.
- **Add / remove a top-level frontend page, sidebar entry, or component** → update the *Folder layout* block.
- **Add / remove a service in `docker-compose.yml`** (e.g. Mailpit, a worker) → update the *Quick start* URL table and the *Configuration* section.
- **Add / rename / remove an environment variable** → update the matching `.env.example` line **and** the variable tables in README.
- **Add / change a user-visible flow** (Jira split, password reset, invites, API tokens, webhooks, custom fields, shared steps, requirements, Kanban view, matrix dimensions, …) → add or update the relevant how-to section, and mention it in the top bullet list if it's a first-class feature.
- **Change a seeded account, demo tenant, or default port** → update the *Seeded accounts* / *Host port overrides* tables.

### What does NOT require a README update

- Refactors that don't change the public surface.
- Bug fixes with no behavioural change the caller can detect.
- Internal library swaps where the external contract holds.
- Tests, logs, comments.

If you're unsure, err toward updating. One extra line in the README is cheaper than a reader hitting a stale curl example.

### Checklist before marking a task done

- [ ] New / renamed routes are in the *API surface* table with correct role tags.
- [ ] New / renamed env vars are in both `.env.example` and the README's config tables.
- [ ] New pages/models/enums are reflected in *Folder layout*, *Domain model*, and the *Enums* line.
- [ ] Role changes are reflected in the *Role capabilities* table.
- [ ] New user-visible flows have at least a short how-to section.
- [ ] Top-bullet feature list still reads as a faithful summary of what the product does today.

## 4. Other standing rules (short)

- **TypeScript strict** is on; don't silence errors with `any` or `@ts-ignore` — fix the type.
- **Prisma migrations**: schema changes go through `prisma db push` in dev and proper migrations in prod.
- **Don't leak secrets**: never log or commit API tokens, Jira credentials, DB URLs with passwords, or JWT secrets.
- **Read before writing**: when editing an unfamiliar area, read neighbouring code (routes, components) to match conventions.

## 5. When in doubt

If a task doesn't obviously have user-visible text or loggable events, still ask: *does this path produce an error I'd want to see in production?* and *does this render anything a user might read?* The answer is usually yes for at least one — and that means a log or a translation key is owed.
