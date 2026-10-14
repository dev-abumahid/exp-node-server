import type { CookieOptions, Response } from 'express';
import { configs } from '../configs/index.js';
import { type TokenUser, jwtHelpers } from './JWT.js';

export const ACCESS_TOKEN_COOKIE = 'access_token';

export const accessTokenCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: configs.is_production,
  sameSite: 'lax',
  path: '/',
};

/** Signs an access token for `user`, sets it as a cookie and returns it. */
export const issueAccessToken = (res: Response, user: TokenUser): string => {
  const accessToken = jwtHelpers.generateToken(
    { accountId: user.accountId, email: user.email, role: user.role, tv: user.tokenVersion },
    configs.jwt.access_token,
    configs.jwt.access_expires,
  );
  res.cookie(ACCESS_TOKEN_COOKIE, accessToken, accessTokenCookieOptions);
  return accessToken;
};

export const clearAccessToken = (res: Response) => {
  res.clearCookie(ACCESS_TOKEN_COOKIE, accessTokenCookieOptions);
};
