# Changelog

## Unreleased

### Added

- `exp-node-server -g <name> --auth`: every generated route requires a signed-in
  user. Routes stay public by default.
- Generated modules come with an example `name` field (validation, Mongoose schema /
  Prisma model, Swagger, tests), so data flows end to end from the start.
- Generated route tests cover invalid bodies (400), and with `--auth` that every
  route rejects anonymous requests (401).
- Templates: integration tests for the email queue (retries, giving up, several
  workers, jobs queued while no worker runs, graceful shutdown). Mongoose runs them
  on the in-memory MongoDB; Prisma runs them when `TEST_DATABASE_URL` points at a
  PostgreSQL.
- CLI test suite: parity checks between the Mongoose and Prisma templates.

### Fixed

- Route registration understands template literals with `${...}`, and checks every
  edit before writing it (balanced brackets, exactly one registration); anything
  unexpected becomes a "register it manually" warning instead of a broken file.
- Taken route paths are found whatever the formatting of `routes.ts` (property order,
  multi-line entries, direct `.use()` mounts) and in other modules' Swagger docs.
- Files are written through a temporary file and renamed, so an interrupted run
  never leaves a half-written file.
- Mongoose template: graceful shutdown no longer waits for the full 30 s drain
  timeout after an email was sent (Agenda's `removeOnComplete` raced with `drain()`).
  Finished email jobs are now removed by a TTL index after an hour.

### Changed

- Templates use nodemailer 10 (fixes the remaining audit warning in the Mongoose
  template; nodemailer now ships its own types).
- `--auth` and `--force` are rejected with `create`, where they don't apply.

## 2.0.0

- Templates rebuilt for security and performance: rate limiting backed by the
  database, refresh tokens with rotation, social login (Google, Facebook, GitHub,
  X, LinkedIn, Discord), pg-boss / Agenda background jobs (no Redis), route tests.
- Mongoose template aligned with the Prisma template (ESM, same endpoints).
- `-g <name>` also generates `tests/routes/<name>.test.ts`; generation is
  all-or-nothing and `--force` keeps backups.
