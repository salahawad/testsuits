# Contributing to TestSuits

Thanks for wanting to contribute — issues, PRs, and thoughtful bug reports are all welcome.

## TL;DR

1. Fork, branch off `main`, commit, open a PR against `main`.
2. Keep PRs focused and small. A linked issue helps.
3. Follow the rules in [CLAUDE.md](CLAUDE.md) — they apply to every change, human or AI.

## Development environment

Everything runs under Docker Compose. You don't need Postgres, MinIO, or Mailpit installed locally.

```bash
git clone https://github.com/salahawad/testsuits.git
cd testsuits
cp .env.example .env
docker compose up --build
```

Quick-start URLs, seeded demo accounts, and env-var docs are all in the [README](README.md#quick-start).

If you want faster hot-reload on the backend or frontend, see [README → Local development](README.md#local-development) for running Node natively against the dockerised Postgres + MinIO.

## Reporting bugs

Open a [bug report](https://github.com/salahawad/testsuits/issues/new?template=bug_report.yml) and fill in every section. The most useful ones are:

- **Steps to reproduce** — be concrete; paste commands and seeded account emails.
- **Actual vs expected** — quoting the UI or the API response helps a lot.
- **Environment** — `docker compose version`, browser, and whether you're using the shipped seed or your own data.

For security-sensitive issues, please follow [SECURITY.md](SECURITY.md) instead of opening a public issue.

## Proposing features

Open a [feature request](https://github.com/salahawad/testsuits/issues/new?template=feature_request.yml) describing the use case first. Implementation is the easy part — fit and scope are the hard ones.

## Pull requests

### Branching and commits

- Branch off `main`, name it `<type>/<short-slug>` (e.g. `feat/kanban-filters`, `fix/jira-epic-null`).
- Keep commits reasonably focused. Imperative subject lines under ~70 chars (`Fix Jira parent_epic handling when project key is null`).
- Don't rewrite history on someone else's branch without asking.

### Before you open the PR

- [ ] `docker compose up --build` starts cleanly.
- [ ] Backend typechecks: `docker compose exec api npx tsc --noEmit`.
- [ ] Frontend typechecks and builds: `docker compose exec web npm run build`.
- [ ] Schema changes are reflected in `prisma/schema.prisma` and the seed still runs (`docker compose exec api npx prisma db seed`).
- [ ] You followed the [CLAUDE.md](CLAUDE.md) checklists — structured logs, both `en.json` and `fr.json`, and README sync.
- [ ] No `console.log`, no hard-coded English/French, no `any` / `@ts-ignore`.

### The PR itself

Fill in the [pull request template](.github/PULL_REQUEST_TEMPLATE.md). Call out any:

- Schema or API surface changes (with before / after snippets).
- New environment variables (add them to both `.env.example` and the README).
- Security-relevant changes (auth, scope, token handling, external calls).

### Review

- Reviewers will focus on correctness, security (multi-tenant scoping in particular), and whether the CLAUDE.md rules were followed.
- CI must pass.
- Squash-merge is the default.

## Project conventions

- **TypeScript strict** everywhere. Don't widen types to make an error go away — fix the cause.
- **Prisma first** — don't hand-write SQL unless there's a measured reason.
- **Multi-tenant scoping** is enforced at the query level in `backend/src/middleware/scope.ts`. Every new route that reads tenant data must use one of the `*Where` helpers.
- **i18n** — every user-visible string must exist in both `frontend/src/i18n/en.json` and `frontend/src/i18n/fr.json` with identical key paths.
- **Logging** — the backend uses pino with request IDs; the frontend uses a shared structured logger. See [CLAUDE.md](CLAUDE.md) for when to log at each level.

## Licensing

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).

## Code of Conduct

Participation in this project is governed by the [Contributor Covenant](CODE_OF_CONDUCT.md). Be kind. Assume good faith.
