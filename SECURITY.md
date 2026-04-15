# Security Policy

## Reporting a vulnerability

**Please don't open a public issue for security-sensitive reports.**

Use one of:

1. **GitHub private security advisory** (preferred) — [report it here](https://github.com/salahawad/testsuits/security/advisories/new). This creates a private thread only maintainers and people you add can see.
2. **Email** — `salah.awad@outlook.com` with subject `[TestSuits security]`.

Please include:

- A description of the issue and the impact.
- Clear reproduction steps (curl / screenshots / a short script).
- Affected version or commit SHA.
- Your contact info so we can follow up.

You can expect an acknowledgement within **3 working days** and a first assessment within **10 working days**. We'll coordinate a disclosure timeline once we understand the scope.

## Supported versions

TestSuits is pre-1.0 and ships only from `main`. Security fixes land on `main`; there are no backports. If you're running an older commit, pull the latest and redeploy.

## What's in scope

The following are in scope for reports:

- Cross-tenant data leaks (a user of company A reading or mutating data of company B).
- Authentication / session bypasses (JWT handling, API tokens, invite / reset tokens).
- Privilege escalation (`TESTER` doing what only `MANAGER` should be able to do).
- Server-side injection (SQL, command, SSRF).
- Sensitive data in logs (passwords, tokens, full Jira credentials).
- Insecure handling of attachments (path traversal, arbitrary content served with an exploitable mime type).
- Jira integration misuse (filing issues into the wrong Jira project because of injection or scope bypass).

## What's out of scope

- Issues that require an already-compromised host or a malicious collaborator inside the same company.
- Rate limiting / brute force on local dev. Deployed instances should sit behind a reverse proxy that handles this.
- Known behaviour documented in the README (e.g. signed download URLs served by `S3_PUBLIC_ENDPOINT`, dev-mode reset-link echo).
- Missing security headers that are the deployment's responsibility.

## Secrets and credentials

- `.env` is gitignored. Never commit a populated `.env` or any file matching `seed.*.local.ts`.
- If you believe credentials have been leaked in this repo's history, report it through the channels above and we'll rotate.
