# Architecture Context

## Request flow

route -> `RequestValidator` (Zod) -> controller -> service -> database

- Routes only wire middleware and controllers.
- Controllers translate HTTP to service calls and responses.
- Services own business logic and database access.
- Validation schemas are the only source of request payload types.

## Cross-cutting concerns

- Auth: `src/app/middlewares/auth.ts`; `auth()` any user, `auth('ADMIN')` role.
- Errors: throw `AppError`; `global_error_handler.ts` formats responses.
- Responses: `manage_response.ts`.
- Async handlers: wrap failures with `catch_async.ts`.
- Rate limits: `src/app/middlewares/rate_limiter.ts`.
- Logging: `src/app/lib/logger.ts` (pino).
- Uploads: in-memory multer then Cloudinary (see `modules/storage.md`).
- Background jobs: `modules/queue.md`.

## Module anatomy

```text
src/app/modules/<module>/
├── <module>.route.ts
├── <module>.controller.ts
├── <module>.service.ts
├── <module>.validation.ts
├── <module>.swagger.ts
└── <module>.schema.ts + <module>.interface.ts   # Mongoose only
```

Prisma models live in `prisma/schema/<module>.prisma`.

## Database access

- Prisma: use the `src/app/lib/prisma.ts` singleton; models are in `prisma/schema/*.prisma`.
- Mongoose: use the connection in `src/app/lib/db.ts`; schemas are exported from module `*.schema.ts` files.
- Never create a second client or connection.
- Prisma schema changes need a migration; plan indexes for Mongoose queries.

## Testing

- Vitest + supertest; route tests live in `tests/routes/`.
- Prisma tests use the mock in `tests/helpers/prisma.ts`.
- Mongoose tests use an in-memory MongoDB.
