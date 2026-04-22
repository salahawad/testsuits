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

- **Zero hardcoded English anywhere in `.tsx` files** — all user-facing strings go through `useTranslation()` → `t('key.path')`. This includes error messages, warning messages, success/info messages, toast notifications, validation hints, confirmation dialogs, empty-state text, tooltips, and placeholder text. No exceptions.
- **All messages from the API** must be translated on the frontend: display `t('errors.' + key)` / `t('warnings.' + key)` / `t('messages.' + key)`, never the raw string from the response body.
- When you add or change a string:
  1. Add the key to [frontend/src/i18n/en.json](frontend/src/i18n/en.json).
  2. Add the **same key** with a French translation to [frontend/src/i18n/fr.json](frontend/src/i18n/fr.json).
  3. Use `{{variable}}` interpolation — never string-concatenation inside `t()`.
- Organise keys by feature area (`runs.*`, `cases.*`, `jira.*`). Keep the structure mirror-identical between `en.json` and `fr.json`.
- The language switcher lives in [LanguageSwitcher.tsx](frontend/src/components/LanguageSwitcher.tsx); don't duplicate it — reuse it.
- Numeric/date formatting: use `Intl.NumberFormat` / `Intl.DateTimeFormat` with the current `i18n.resolvedLanguage`.

### Backend

- **Never return hardcoded English messages from the API.** Every message in an API response that could reach the frontend — errors, warnings, info/success messages — must use a stable machine key (e.g. `"error": "AUTH_INVALID_CREDENTIALS"`, `"message": "RUN_CLOSED_SUCCESS"`) — never prose like `"Invalid email or password"` or `"Run closed successfully"`. The frontend is responsible for translating these keys via `t()`.
- When adding or changing any API message (error, warning, or info):
  1. Choose a stable, descriptive key (e.g. `AUTH_SESSION_EXPIRED`, `PROJECT_NOT_FOUND`, `RUN_CLOSE_SUCCESS`, `INVITE_SENT`).
  2. Return it in the response field: `res.status(xxx).json({ error: 'AUTH_SESSION_EXPIRED' })` or `res.json({ message: 'INVITE_SENT' })`.
  3. Add the matching translation to **both** `en.json` and `fr.json` under the appropriate namespace (`errors.*`, `warnings.*`, or `messages.*`).
  4. The frontend must display these via `t('errors.' + key)` / `t('warnings.' + key)` / `t('messages.' + key)` — never render the raw API string.
- This applies to validation errors, auth errors, business-logic errors, success confirmations, info notices, warnings, and any other response the user might see. No exceptions.

### Checklist before marking a task done

- [ ] Every new user-visible string is in **both** `en.json` and `fr.json`.
- [ ] No hard-coded English/French in `.tsx` files — including errors, warnings, success/info messages, toasts, validation text, empty states, and tooltips.
- [ ] Every backend response message (error, warning, info, success) uses a stable machine key, not English prose.
- [ ] Every backend message key has a matching entry in both `en.json` and `fr.json` (`errors.*`, `warnings.*`, or `messages.*`).
- [ ] The frontend displays all API messages via `t()` with the appropriate namespace, never the raw response string.
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
- **Never auto-commit or auto-push.** Do not run `git commit`, `git push`, or any destructive git operation unless the user has explicitly asked for it in *this* turn. A prior "commit and push" instruction does **not** authorise future commits — every commit needs its own green light. When work is ready, summarise the diff and ask; don't volunteer.
- **Never deploy to Kubernetes without written confirmation.** Do not run `kubectl apply`, `kubectl rollout`, `kubectl delete`, image builds/pushes targeting the cluster, Helm installs/upgrades, or any command that mutates the k8s deployment (including the Scaleway cluster behind testsuits.hapster.dev) unless the user has explicitly asked for it in *this* turn in writing. A prior deploy instruction does **not** authorise future deploys — every deploy needs its own green light. When a change is ready to ship, summarise what would be deployed and ask; don't volunteer.
- **Never run the database seeder without written confirmation.** Do not run `npx prisma db seed`, `prisma:seed`, `tsx prisma/seed.ts`, `tsx prisma/seed.hapster.ts`, a one-off `kubectl exec … seed` job, or any other invocation that executes the seed scripts — locally, in Docker, or against any cluster. The production `Dockerfile.prod` no longer seeds on boot by design. Demo seed data can overwrite real company records or resurrect deleted demo rows, so seeding requires explicit per-turn written approval. A prior seed instruction does **not** authorise future seeding.

## 5. When in doubt

If a task doesn't obviously have user-visible text or loggable events, still ask: *does this path produce an error I'd want to see in production?* and *does this render anything a user might read?* The answer is usually yes for at least one — and that means a log or a translation key is owed.
