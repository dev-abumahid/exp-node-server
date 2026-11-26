# Queue Module

Status: Implemented
Module: queue
Route: internal (no HTTP routes)
Backend: {{queueBackend}}

- Prisma: pg-boss, stored in PostgreSQL.
- Mongoose: Agenda, stored in MongoDB (`agendaJobs` collection).

No Redis is used.

## Capabilities

- Background email jobs
- Retries with backoff
- Graceful shutdown
- Prisma only: maintenance job for expired rate-limit rows

## Integration

- Start and stop through `startQueues()` / `stopQueues()` in `src/server.ts`.
- Enqueue emails with `enqueueEmail(job)` from `src/app/queues/email.queue.ts`.
- Add a job type by extending `EmailJob` and `render`, or add a new queue using the existing worker instance.
- Never create another queue client or connection.
- Never add a second queue library.

## Entry points

- `src/app/queues/index.ts`
- `src/app/queues/email.queue.ts`
- `src/app/queues/boss.ts` (Prisma) / `agenda.ts` (Mongoose)
- `src/app/queues/maintenance.queue.ts` (Prisma only)

## Restrictions

- Never block a request with a long email send; enqueue it.
- Never duplicate retry or cleanup logic.
- Do not add Redis unless the project explicitly migrates to it.
