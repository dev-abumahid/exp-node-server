# Auth Module

Status: Implemented
Module: account
Route: /api/auth
Entry point: `src/app/modules/account/`

## Capabilities

- Sign up, sign in, sign out, sign out everywhere
- Email OTP and verification-link account verification
- Password change, forgot password and reset password
- Access + rotating refresh tokens (httpOnly cookies; refresh token also accepted in the body for mobile)
- Social login: Google, Facebook, GitHub, X/Twitter, LinkedIn, Discord
- Account profile creation on sign up

## Integration

- Reuse `account_services` and `createSession` / `clearSessionCookies`.
- Protect routes with `auth()` or `auth('ADMIN')`.
- Use the existing rate limiters for new auth endpoints.
- Use `configs.jwt.*` and the existing token helpers.
- Never implement a second login, token or password-reset system.

## Entry points

- `src/app/modules/account/account.route.ts`
- `src/app/modules/account/account.service.ts`
- `src/app/utils/session.ts`
- `src/app/utils/JWT.ts`
- `src/app/utils/auth_cookie.ts`
- `src/app/utils/otp.ts`
- `src/app/passport-js/`
- `src/app/middlewares/auth.ts`

## Data

- Account, RefreshToken, SocialAccount and SocialLoginCode (Prisma models or Mongoose collections).
- OTPs and refresh tokens are stored hashed; secrets are never returned.

## Restrictions

- Never duplicate authentication, token rotation or OTP logic.
- Never expose passwords, OTP hashes or refresh tokens.
- Check ownership before reading or changing another account's data.
