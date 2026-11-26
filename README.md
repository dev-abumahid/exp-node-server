# ⚡ Express Server CLI

[![npm version](https://img.shields.io/npm/v/exp-node-server.svg)](https://www.npmjs.com/package/exp-node-server)
[![npm downloads](https://img.shields.io/npm/dw/exp-node-server.svg)](https://www.npmjs.com/package/exp-node-server)
[![npm total downloads](https://img.shields.io/npm/dt/exp-node-server.svg)](https://www.npmjs.com/package/exp-node-server)
[![Made with TypeScript](https://img.shields.io/badge/Made%20with-TypeScript-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20.17+-green.svg)](https://nodejs.org/)

---

## 🚀 Overview

A powerful `Express + TypeScript CLI` that instantly generates scalable `backend` modules with `Mongoose `/ `Prisma`, `Zod` `validation`, and `Swagger` documentation.

This tool helps developers quickly scaffold `clean`, `modular` `Express` APIs with minimal setup.

## ✨ Features

- ⚡ Generate complete `Express` + `TypeScript` modules
- 🧩 Built-in `Mongoose` / `Prisma` support
- 📘 Automatic `Swagger` documentation
- 🔐 `Zod` validation ready
- 🏗️ `Modular` clean architecture
- 🚀 One command project setup
- 🔄 Add modules anytime
- 🤖 Agent-independent AI workflow (`ExpFlow`)
- 🧠 Project knowledge base with selective context loading and `ai sync`
- 📦 Zero boilerplate setup

## 📋 Requirements

- Node.js **20.17+** to run the CLI; generated projects need Node.js **22.12+**
- Docker (or your own database): PostgreSQL for Prisma, MongoDB for Mongoose

## 📥 Installation

No install needed: `npx` always runs the latest version (recommended).

```bash
npx exp-node-server --help
```

Or install it globally to use `exp-node-server` directly:

```bash
npm install -g exp-node-server
exp-node-server --version
```

## 📦 Quick Start

Run directly using npx (recommended):

```bash
npx exp-node-server -c my-api
```

You'll be asked to pick a template (Mongoose or Prisma). To skip the prompt:

```bash
npx exp-node-server create my-api --template prisma
```

Then:

```bash
cd my-api
npm install
cp .env.example .env     # fill in the secrets (openssl rand -hex 32)
docker compose up -d     # starts PostgreSQL / MongoDB
npm run db:migrate       # Prisma only
npm run dev              # http://localhost:5000, docs at /docs
npm test
```

### What you get

```text
my-api/
├── src/
│   ├── app.ts                 # express app: helmet, cors, rate limit, routes
│   ├── server.ts              # connects the database, starts queues, graceful shutdown
│   ├── routes.ts              # module routers (generated modules are added here)
│   ├── swaggerOptions.ts      # API docs (generated modules are added here)
│   └── app/
│       ├── configs/           # env vars, validated with zod on startup
│       ├── middlewares/       # auth, validation, rate limiting, uploads, errors
│       ├── modules/
│       │   ├── account/       # sign up/in, OTP, refresh tokens, password reset
│       │   └── profile/       # profile + photo upload (Cloudinary)
│       ├── passport-js/       # social login (Google, Facebook, GitHub, X, LinkedIn, Discord)
│       ├── queues/            # background email jobs (pg-boss / Agenda, no Redis)
│       ├── templates/         # email templates
│       └── utils/
├── tests/
│   ├── routes/                # supertest suites, one per module
│   └── helpers/
├── prisma/schema/             # Prisma only: one .prisma file per model
├── docker-compose.yml
└── .env.example
```

## 🤖 AI Workflow (ExpFlow)

ExpFlow is a spec-driven workflow for AI agents. The canonical rules and
workflows live in `.expflow/`; OpenCode and Antigravity get thin adapters, so the
workflow is never duplicated between agents. It is Markdown-only: no AI API key
and no extra dependency is required.

Inside a generated project run:

```bash
npx exp-node-server ai init
```

This adds:

```text
.expflow/
├── config.json
├── context/
│   ├── project.md
│   ├── architecture.md
│   ├── modules.md
│   ├── modules/*.md          # auth, profile, queue, email, storage, ...
│   └── database/schema-overview.md
├── rules/backend.md
├── workflows/
│   ├── propose.md
│   ├── apply.md
│   ├── verify.md
│   ├── archive.md
│   └── sync.md
└── changes/
.opencode/commands/          # OpenCode adapters
.agents/skills/              # Antigravity skills
AGENTS.md                    # short global instructions
```

The context folder is the project knowledge base. Agents read `modules.md` first
and then load only the context documents relevant to the current task. Context is
documentation; the source code and schemas remain the actual truth.

Then use the same slash commands in any supported agent:

```text
/propose user referral system
/apply referral-system
/verify referral-system
/archive referral-system
/sync
```

The lifecycle is:

1. `/propose` writes `.expflow/changes/<id>/proposal.md` and `tasks.md`. No source
   code is changed.
2. `/apply <id>` is the explicit approval and implements the proposed tasks.
3. `/verify <id>` runs the project's own checks and writes `verification.md`.
4. `/archive <id>` moves a passed change to `.expflow/archive/<id>/`.
5. `/sync` refreshes context documentation when modules, routes or schemas change.

### Sync project context

The CLI can compare the context documents with the actual source tree:

```bash
npx exp-node-server ai sync          # write a report, change nothing
npx exp-node-server ai sync --apply  # update managed tables and create missing stubs
```

`ai sync` detects modules, routes and database models. It updates only the managed
blocks in `context/modules.md` and `context/database/schema-overview.md`, creates
stubs for modules that have no context yet, and writes the full report to
`.expflow/context/sync-report.md`. It never overwrites a context document you have
written and never modifies source code.

`ai init` detects the database from `.projectrc.json`. Outside a generated
project, pass `--database <mongoose|prisma>`. Existing files are never deleted:
conflicting managed files are reported, and `--force` replaces only managed files
after backing them up to `.exp-node-server/backups/`. An existing `AGENTS.md`
keeps its own content; the ExpFlow block is appended in place. `ai sync` follows
the same rule: it reports drift first and only updates its own managed sections.

```bash
npx exp-node-server ai init --database mongoose
npx exp-node-server ai init --force
npx exp-node-server ai sync
npx exp-node-server ai sync --apply
```

## 🧩 Generate a Module

Inside your project root run:

```bash
npx exp-node-server -g <module-name>
```

Example: `npx exp-node-server -g order`

Output:

```bash
✔ src/app/modules/order/order.controller.ts created
✔ src/app/modules/order/order.route.ts created
✔ src/app/modules/order/order.validation.ts created
✔ src/app/modules/order/order.swagger.ts created
✔ src/app/modules/order/order.interface.ts created
✔ src/app/modules/order/order.schema.ts created
✔ src/app/modules/order/order.service.ts created
✔ tests/routes/order.test.ts created
✔ Route registered in routes.ts
✔ Swagger docs registered in swaggerOptions.ts
```

The route and Swagger docs are wired up automatically. For Prisma projects a
`prisma/schema/<module>.prisma` model is created as well.

A ready-to-run [supertest](https://github.com/ladjs/supertest) suite is created in
`tests/routes/<module>.test.ts`. It covers create, list, get, update and delete,
including the 404s, and passes as generated:

```bash
npm test -- tests/routes/order.test.ts
```

Generated modules start with an example `name` field, from the validation to the
database schema and the tests, so data flows end to end right away. Rename it or add
your fields in the same places, and update `createPayload` / `updatePayload` at the
top of the test. These are starter tests: extend them with your business rules.

### Protected routes

Generated routes are **public** by default. To require a signed-in user on every
route:

```bash
npx exp-node-server -g order --auth
```

The generated test then also checks that anonymous requests get a 401. To limit a
route to admins, change `auth()` to `auth('ADMIN')` in `order.route.ts`.
Mongoose tests run against an in-memory MongoDB; Prisma tests use the Prisma mock in
`tests/helpers/prisma.ts`. Module names whose path is already taken (e.g. `auth`) are
refused.

## 🛠️ CLI Reference

```text
npx exp-node-server create <project-name> [--template <mongoose|prisma>]
npx exp-node-server generate <module-name> [--auth] [--force]
npx exp-node-server ai init [--database <mongoose|prisma>] [--force]
npx exp-node-server ai sync [--apply]

Commands
  create, -c <name>      Create a new project from a template
  generate, -g <name>    Generate a module in the current project
  ai init                Add the ExpFlow AI workflow and project context
  ai sync                Check project context against the source code

Options
  -t, --template <name>  Template to use with create (mongoose | prisma)
  -a, --auth             Generated routes require a signed-in user (default: public)
  -f, --force            Overwrite an existing module, or refresh managed ExpFlow files
      --database <name>  Database for ai init (default: from .projectrc.json)
      --apply            Apply the context changes proposed by ai sync
  -h, --help             Show help
  -v, --version          Show version
```

- Project names are lowercased and spaces become dashes (`My API` → `my-api`).
- Module names are lowercased and spaces/dashes become underscores (`order-item` → `order_item`).

### Safety

- **All or nothing:** a module is generated in one step. If anything fails (e.g. a
  file can't be written), the project is left exactly as it was.
- **`--force` keeps backups:** files it overwrites are copied first to
  `.exp-node-server/backups/<timestamp>/` (ignored by git, ESLint and Prettier).
  Files that wouldn't change are left alone.
- **Safe AI init:** `ai init` never deletes user files. Conflicting managed files
  are reported instead of overwritten; `--force` replaces only managed files after
  backing them up. Change artifacts and an existing `AGENTS.md` are preserved.
- **Safe context sync:** `ai sync` only writes a report by default. `--apply`
  updates managed registry/model sections and creates missing stubs; user-written
  context documents are never overwritten.
- **No clashes:** a module name whose URL is already used by another router (e.g.
  `auth`) is refused.
- **Validated input only:** generated services receive `req.body` after
  `RequestValidator` parsed it with the module's zod schema, so unknown fields are
  dropped. Payload types come from that schema (`z.infer`).

## 📁 Generated Module Structure

Each module follows a clean structure:

```Bash
src/app/modules/<module-name>/
 ├── <module>.interface.ts    # mongoose
 ├── <module>.schema.ts       # mongoose (prisma: prisma/schema/<module>.prisma)
 ├── <module>.validation.ts
 ├── <module>.route.ts
 ├── <module>.controller.ts
 ├── <module>.service.ts
 └── <module>.swagger.ts

tests/routes/
 └── <module>.test.ts
```

## ⚙️ Run the Project

```bash
npm run dev
```

Swagger docs available at:

```bash
http://localhost:5000/docs
```

## 🧠 Tech Stack

- Express.js — Backend framework
- TypeScript — Strongly typed JavaScript
- Mongoose — MongoDB ODM
- Prisma — PostgreSQL ORM
- Zod — Runtime schema validation
- JWT — Authentication
- Swagger — API documentation

## 🧑‍🔧 Development

```bash
npm install
npm run dev        # rebuild on change (tsup --watch)
npm run typecheck  # tsc
npm test           # vitest (unit + end-to-end against dist/)
npm run build      # bundle to dist/cli.js
```

Try the local build with `node dist/cli.js --help`, or run `npm link` to use
`exp-node-server` globally.

> Templates live in `templates/`. npm strips `.gitignore` files when
> publishing, so name them `_gitignore`. They're renamed when a project is created.

## 👨‍💻 Author

### Abumahid

GitHub
https://github.com/dev-abumahid

npm
https://www.npmjs.com/~dev_abumahid

Portfolio
https://abumahid.me

LinkedIn
https://linkedin.com/in/md-abu-mahid-islam

## ⭐ Support

If you find this project helpful, consider giving it a ⭐ on `GitHub`.

It helps the project grow and reach more developers.

