# Backend Engineering Rules

## Architecture

- Follow the existing modular architecture.
- Separate routes, controllers, services and validations.
- Keep business logic inside services.
- Keep controllers thin.
- Reuse shared utilities and middlewares.

## TypeScript

- Use strict typing.
- Avoid `any`.
- Define reusable interfaces and types.
- Avoid unnecessary type assertions.

## Validation

- Validate every external input.
- Use the existing Zod validation pattern.
- Never trust client-provided data.

## Database

- Follow the existing Prisma/Mongoose conventions.
- Avoid unnecessary queries.
- Use transactions for multi-step critical operations.
- Consider indexes and query performance.
- Never change an existing schema without migration planning.

## Security

- Enforce authentication and authorization.
- Validate resource ownership.
- Never expose sensitive fields.
- Prevent mass assignment.
- Use the existing error handling.

## Testing

- Test success and failure cases.
- Cover validation and authorization.
- Test edge cases.
- Never claim tests passed without execution.

## General

- Keep changes minimal.
- Follow existing naming conventions.
- Do not introduce dependencies without justification.
- Do not refactor unrelated modules.
