# Rate Limiting Module

Status: Implemented
Module: rate_limiter
Route: internal middleware
Store: {{databaseStore}}

## Capabilities

- Coarse per-instance API limit
- Strict auth limits (sign up, sign in, OTP/reset, email sending, refresh, social)
- Shared store across app instances without Redis

## Integration

- Import `rateLimiters` and `apiRateLimiter`.
- Add a new named limiter with `createLimiter` in the existing file.
- Keep limiter names unique; the store prefixes keys.
- Never add Redis or a second rate-limit implementation.

## Entry points

- `src/app/middlewares/rate_limiter.ts`

## Restrictions

- Use `ipKeyGenerator` for IP keys.
- Do not remove limits from authentication or email endpoints.
- Prisma: expired rows are cleaned by the maintenance queue.
- Mongoose: a TTL index cleans counters automatically.
