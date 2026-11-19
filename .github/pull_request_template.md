## What and why

<!-- What does this change, and what problem does it solve for stewards? -->

## How it was tested

- [ ] `npm run lint`
- [ ] `npm run check`
- [ ] `npm run test:unit -- --run`
- [ ] `npm run test:e2e` (for UI or flow changes)

## Checklist

- [ ] Deadline math changes come with tests in `src/lib/deadlines/`
- [ ] Schema changes include a migration (`npm run db:generate`)
- [ ] User-facing changes are noted in `CHANGELOG.md` under _Unreleased_
- [ ] No real member, grievance or contract data in fixtures or screenshots
