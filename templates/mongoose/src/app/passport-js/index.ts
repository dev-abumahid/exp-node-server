import type { Express, NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import passport from 'passport';
import { configs } from '../configs/index.js';
import { logger } from '../lib/logger.js';
import { rateLimiters } from '../middlewares/rate_limiter.js';
import manageResponse from '../utils/manage_response.js';
import { getReturnTo } from './oauth-state.js';
import { enabledSocialProviders, type SocialProvider } from './providers.js';
import { createSocialLoginCode, SocialLoginError } from './social-account.js';

for (const provider of enabledSocialProviders) {
  passport.use(provider.name, provider.createStrategy());
}

/** Mounts passport on the app. Logins are stateless, no session is needed. */
export const setupPassport = (app: Express) => {
  app.use(passport.initialize());
};

/** Sends the browser back to the front-end with `?code=` or `?error=`. */
const redirectToFrontEnd = (res: Response, params: Record<string, string | undefined>) => {
  const url = new URL(configs.social.redirect_url);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }
  res.redirect(url.toString());
};

/** Maps a failed handshake to a short error code the front-end can show. */
const errorCode = (req: Request, err: unknown, info: unknown): string => {
  if (err instanceof SocialLoginError) return err.code;
  if (req.query.error === 'access_denied' || req.query.denied) return 'access_denied';
  const message = err instanceof Error ? err.message : (info as { message?: string })?.message;
  if (message === 'invalid_state') return 'invalid_state';
  if (err) logger.error({ err }, 'Social login failed');
  return 'social_login_failed';
};

const callback =
  ({ name }: SocialProvider) =>
  (req: Request, res: Response, next: NextFunction) => {
    passport.authenticate(
      name,
      { session: false },
      async (err: unknown, user: Express.User | false, info: unknown) => {
        const returnTo = getReturnTo(res);
        if (err || !user) {
          return redirectToFrontEnd(res, { error: errorCode(req, err, info), returnTo });
        }
        try {
          const code = await createSocialLoginCode(user.accountId);
          redirectToFrontEnd(res, { code, returnTo });
        } catch (e) {
          next(e);
        }
      },
    )(req, res, next);
  };

/**
 * `GET /providers` lists the enabled providers (for rendering login buttons),
 * `GET /<provider>?returnTo=/path` starts a login, `GET /<provider>/callback` finishes it.
 */
export const socialAuthRouter = Router();

socialAuthRouter.get('/providers', (_req, res) => {
  manageResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Social login providers fetched successfully',
    data: enabledSocialProviders.map(({ name, label }) => ({
      name,
      label,
      url: `/api/auth/social/${name}`,
    })),
  });
});

for (const provider of enabledSocialProviders) {
  socialAuthRouter.get(
    `/${provider.name}`,
    rateLimiters.social,
    passport.authenticate(provider.name, { session: false }),
  );
  socialAuthRouter.get(`/${provider.name}/callback`, callback(provider));
}
