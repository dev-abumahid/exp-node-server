# API Documentation Module

Status: Implemented
Module: swagger
Route: /docs

## Capabilities

- Swagger UI generated from JSDoc comments
- Disabled in production unless `ENABLE_SWAGGER=true`

## Integration

- Add docs to `<module>.swagger.ts` and register them in `src/swaggerOptions.ts`.
- The `generate` command does both automatically.
- Never maintain a separate OpenAPI file unless the project explicitly migrates.

## Entry points

- `src/swaggerOptions.ts`
- `src/app/modules/<module>/<module>.swagger.ts`
- `src/app.ts` (`/docs`)
