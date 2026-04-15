## Summary

<!-- 1-3 sentences: what does this change do and why. -->

## Related issue

<!-- Closes #123 / Part of #456 / N/A -->

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Refactor (no behaviour change)
- [ ] Docs / chore
- [ ] Breaking change (schema, API surface, or env)

## Screenshots / curl

<!-- Before / after for UI changes. Request + response example for API changes. -->

## Test plan

<!-- Steps a reviewer can run locally. -->

1.
2.
3.

## CLAUDE.md checklist

- [ ] Structured logs added for new endpoints, mutations, and external calls.
- [ ] Every new user-visible string is in **both** `frontend/src/i18n/en.json` and `frontend/src/i18n/fr.json` with identical key paths.
- [ ] README is updated for any change to: routes, schema, enums, roles, pages, env vars, services, or seeded demo data.
- [ ] No `console.log`, no hard-coded English/French, no `any` / `@ts-ignore`.
- [ ] Tenant scoping uses one of the `*Where` helpers in `backend/src/middleware/scope.ts`.

## Notes for reviewers

<!-- Anything non-obvious: trade-offs you considered, follow-ups you're punting, risky spots you want a second pair of eyes on. -->
