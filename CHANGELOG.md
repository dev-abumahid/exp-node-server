# Changelog

## 2.3.0

### Added

- ExpFlow project context: `ai init` now creates `.expflow/context/` with
  `project.md`, `architecture.md`, `modules.md`, per-module docs for auth,
  profile, queue, email, storage, rate limiting and API docs, plus a database
  schema overview. Context is rendered for the detected Mongoose or Prisma project.
- `exp-node-server ai sync`: scans modules, routes and database models, writes
  `.expflow/context/sync-report.md`, and reports missing, stale or orphan context.
- `ai sync --apply`: updates the managed module registry and model tables and
  creates stubs for modules without context. User-written context is never
  overwritten.
- `/sync` workflow with OpenCode and Antigravity adapters.
- `propose`, `apply` and `verify` now load context selectively, enforce a reuse
  policy, and report context drift.

### Changed

- Context uses a small index (`modules.md`) instead of loading everything, keeping
  token usage low while avoiding duplicated infrastructure.

## 2.2.0

### Added

- `exp-node-server ai init`: installs ExpFlow, an agent-independent workflow for
  backend features (`/propose` → `/apply` → `/verify` → `/archive`).
- `.expflow/` template with project config, backend engineering rules, the four
  canonical workflows and a `changes/` folder for per-feature artifacts.
- OpenCode adapters in `.opencode/commands/` and Antigravity skills in
  `.agents/skills/`; both delegate to the same `.expflow/workflows/` files.
- `ai init` detects the database from `.projectrc.json`; `--database` overrides it
  outside a generated project.
- Safe initialization: existing files are never deleted. Conflicting managed files
  are reported, `--force` replaces them after backing them up, change artifacts are
  preserved, and an existing `AGENTS.md` keeps its content with the ExpFlow block
  appended.
- Test coverage for the template, initialization, conflict handling and the bundled
  CLI.

### Changed

- The `--force` backup location is now shared by module generation and `ai init`.

## 2.1.0

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
