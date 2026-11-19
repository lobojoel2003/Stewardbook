# Contributing to Stewardbook

Thanks for helping stewards keep their deadlines. Contributions of all sizes are welcome — bug reports with a
fictional example of a deadline that came out wrong are especially valuable.

## Ground rules

- **No real member data.** Never put real names, grievances or non-public contract text in issues, fixtures or
  screenshots. Use the fictional sample in `examples/`.
- **Deadlines are safety-critical.** Any change to `src/lib/deadlines` or `src/lib/contracts` needs tests that show the
  dates you expect and why.
- Be kind. See the [Code of Conduct](CODE_OF_CONDUCT.md).

## Getting set up

You need Node.js 22.12+ and a Postgres database.

```bash
npm ci
```

```bash
cp .env.example .env
```

```bash
npm run db:seed -- --reset
```

```bash
npm run dev
```

Sign in as `sam@local512.example` / `stewardbook-demo`.

## Before you open a pull request

```bash
npm run lint && npm run check
```

```bash
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/stewardbook_unit npm run test:coverage
```

```bash
npm run build && E2E_DATABASE_URL=postgres://postgres:postgres@localhost:5432/stewardbook_e2e npm run test:e2e
```

The integration and end-to-end suites **wipe** the database they're pointed at; the e2e reset script refuses to run
unless the URL contains `test`, `e2e` or `ci`.

## Conventions

- **Imports**: inside `src/routes` and components use the `#lib/…` alias with the file extension
  (`#lib/server/cases.ts`). Inside `src/lib` use relative imports so scripts and tests can load the modules directly.
- **Dates** are ISO `YYYY-MM-DD` strings. Use the helpers in `src/lib/deadlines/dates.ts`; never `new Date('2026-11-19')`
  for date math.
- **Database changes**: edit `src/lib/server/db/schema.ts`, then `npm run db:generate -- --name short_description`
  and commit the migration in `drizzle/`.
- **UI**: plain CSS with the tokens in `src/app.css`; check light and dark mode and a phone-sized screen.
- **Commits**: [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`…) so the
  changelog is easy to write.
- Add a line under **Unreleased** in `CHANGELOG.md` for anything a steward would notice.

## Releasing

Maintainers: see [docs/RELEASING.md](docs/RELEASING.md).

By contributing you agree that your contributions are licensed under the AGPL-3.0, like the rest of the project.
