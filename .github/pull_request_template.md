## Summary

<!-- What changes and why, in a few lines. Link the ADR or issue when there is one. -->

## Checklist

- [ ] Title follows Conventional Commits, in English, lower-case and imperative (`feat(orders): add payment request`)
- [ ] One concern per PR; no unrelated refactor
- [ ] Domain rules live in the domain, with unit tests (success, invalid input, edge cases)
- [ ] Permissions are enforced in the use case, with a test per role and a 403 case
- [ ] New or changed routes have API tests, and the OpenAPI/README endpoint table is updated
- [ ] Migrations have a paired `DOWN`, and `Migrations Up/Down` is green
- [ ] Coverage stays at or above 95%
- [ ] No secrets, tokens, cookies, or password hashes in code, logs, or fixtures
- [ ] Docs and ADRs updated when behavior or configuration changes

## Test plan

<!-- Commands run and results. Heavy tests (load) run in CI only. -->
