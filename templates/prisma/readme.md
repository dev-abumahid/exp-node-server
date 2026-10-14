# ⚡ Express Server CLI

[![npm version](https://img.shields.io/npm/v/exp-node-server.svg)](https://www.npmjs.com/package/exp-node-server)
[![npm downloads](https://img.shields.io/npm/dw/exp-node-server.svg)](https://www.npmjs.com/package/exp-node-server)
[![npm total downloads](https://img.shields.io/npm/dt/exp-node-server.svg)](https://www.npmjs.com/package/exp-node-server)
[![Made with TypeScript](https://img.shields.io/badge/Made%20with-TypeScript-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)

---

## 🚀 Overview

A powerful `Express + TypeScript CLI` that instantly generates scalable `backend` modules with `Mongoose `/ `Prisma`, `Zod` `validation`, and `Swagger` documentation.

This tool helps developers quickly scaffold `clean`, `modular` `Express` APIs with minimal setup.

## ✨ Features

- ⚡ Generate complete `Express` + `TypeScript` modules
- 🧩 Built-in `Mongoose` / `Prisma` support
- 📘 Adds Swagger documentation automatically
- 📘 Automatic `Swagger` documentation
- 🔐 `Zod` validation ready
- 🏗️ `Modular` clean architecture
- 🚀 One command project setup
- 🔄 Add modules anytime
- 📦 Zero boilerplate setup

## 📦 Quick Start

Run directly using npx (recommended):

```Bash
npx exp-node-server -c my-api
```

This will:

- Create an Express starter project
- Install dependencies
- Prepare the project for development

## 🧩 Generate a Module

Inside your project run:

```bash
npx express-server-cli -g <module-name>
```

Example: `npx express-server-cli -g order`

Output:

```Bash
✔ order.interface.ts created
✔ order.schema.ts created
✔ order.validation.ts created
✔ order.route.ts created
✔ order.controller.ts created
✔ order.service.ts created
✔ order.swagger.ts created

🔗 Route registered in routes.ts
📘 Swagger docs registered

```

## 📁 Generated Module Structure

Each module follows a clean structure:

```Bash
src/app/modules/<module-name>/
 ├── <module>.interface.ts
 ├── <module>.schema.ts
 ├── <module>.validation.ts
 ├── <module>.route.ts
 ├── <module>.controller.ts
 ├── <module>.service.ts
 └── <module>.swagger.ts
```

## ⚙️ Run the Project

```bash
npm run dev
```

Swagger docs available at:

```bash
http://localhost:5000/docs
```

## 🔐 Environment

Copy `.env.example` to `.env` and fill it in. The app validates its environment
on startup and exits with a list of anything missing or invalid.

`ACCESS_TOKEN`, `VERIFIED_TOKEN` and `RESET_SECRET` must be **different** random
values of at least 32 characters:

```bash
openssl rand -hex 32
```

## 📬 Background Jobs

Emails (account verification and password reset) are sent through a single
`email` queue powered by [pg-boss](https://github.com/timgit/pg-boss). It stores
jobs in a `pgboss` schema in the same PostgreSQL database, so no Redis is needed.
Failed sends are retried with backoff.

To add a new email, add a variant to `EmailJob` in `src/app/queues/email.queue.ts`
and handle it in `render()`.

A scheduled `maintenance` job (every 15 minutes, run once across all instances)
deletes expired rate limit counters and social login codes.

## 🔐 Sessions & Refresh Tokens

Signing in (password or social) returns a short-lived **access token** (`ACCESS_EXPIRES`,
15 minutes by default) and a **refresh token** (`REFRESH_EXPIRES_DAYS`, 30 by default).
Both are also set as httpOnly cookies; the refresh cookie is only sent to `/api/auth`.

- `POST /api/auth/refresh-token`: when the access token expires (401), get new tokens.
  Browsers send the cookie automatically; other clients send `{ "refreshToken": "..." }`.
- `POST /api/auth/sign-out`: ends this device's session.
- `POST /api/auth/sign-out-all`: ends every session (also happens on password change/reset).

Refresh tokens are random strings stored only as hashes, and are **rotated** on every
refresh. If an already-used refresh token shows up again, it was most likely stolen,
so the whole session is revoked. (A reuse within 30 seconds is treated as two tabs
refreshing at once and only that request fails.)

## 🔑 Social Login

Supported: **Google, Facebook, GitHub, X (Twitter), LinkedIn and Discord**. Set
`IS_<PROVIDER>_LOGIN=true` and fill in the credentials in `.env`.

- `GET /api/auth/social/providers`: enabled providers, for rendering buttons
- `GET /api/auth/social/<provider>?returnTo=/dashboard`: start the login (a link, not `fetch`)
- `GET /api/auth/social/<provider>/callback`: OAuth callback (register this URL at the provider)
- `POST /api/auth/social/exchange` `{ "code": "..." }`: trade the code for an access token

After the provider, the browser lands on `SOCIAL_REDIRECT_URL` (default
`FRONT_END_URL/auth/social/callback`) with either `?code=...&returnTo=...` or
`?error=...`. The front-end posts the code (single-use, valid for 60 seconds) to
`/exchange`, which returns the access token and sets the cookie, like `/sign-in`.

Every login is protected by an OAuth `state` (and PKCE for Google), stored in a
short-lived encrypted cookie, so no session store is needed. Identities are linked
by the provider's user id, and only verified provider emails are used to create or
link accounts. Providers are defined in `src/app/passport-js/providers.ts`.

## 🛡️ Rate Limiting

The auth endpoints have their own limits (sign-in per IP + email, emails per
recipient, OTP / reset guesses per IP), stored in the `RateLimit` table so they are
shared by every instance — no Redis needed. A pg-boss job removes expired rows.
The whole API also has a lenient per-instance in-memory limit. Tune them in
`src/app/middlewares/rate_limiter.ts`, and set `TRUST_PROXY` when running behind a
proxy so the real client IP is used.

## 🧪 Tests

```bash
npm test
```

Route tests with [supertest](https://github.com/ladjs/supertest) run each request
through the route, controller and service. Prisma, the email queue and Cloudinary
are mocked, so no database is needed.

## 🧠 Tech Stack

- Express.js — Backend framework
- pg-boss — PostgreSQL job queue
- TypeScript — Strongly typed JavaScript
- Mongoose — MongoDB ODM
- Prisma — PostgreSQL ORM
- Zod — Runtime schema validation
- JWT — Authentication
- Swagger — API documentation

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
