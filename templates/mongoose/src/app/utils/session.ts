import type { CookieOptions, Request, Response } from 'express';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { configs } from '../configs/index.js';
import { refresh_token_model } from '../modules/account/account.schema.js';
import { clearAccessToken, issueAccessToken } from './auth_cookie.js';
import type { TokenUser } from './JWT.js';

export const REFRESH_TOKEN_COOKIE = 'refresh_token';

const refreshCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: configs.is_production,
  sameSite: 'lax',
  // only sent to the auth routes (refresh, sign out), never to the rest of the API
  path: '/api/auth',
};

export const hashRefreshToken = (token: string) => createHash('sha256').update(token).digest('hex');

/** The refresh token from the cookie (browsers) or the body (mobile / other clients). */
export const readRefreshToken = (req: Request): string | undefined => {
  const token = req.cookies?.[REFRESH_TOKEN_COOKIE] ?? req.body?.refreshToken;
  return typeof token === 'string' && token ? token : undefined;
};

/**
 * Signs `user` in: a new access token plus a refresh token, both set as httpOnly
 * cookies and returned. Pass `familyId` when rotating, so the new refresh token
 * belongs to the same session.
 */
export const createSession = async (
  res: Response,
  user: TokenUser,
  familyId: string = randomUUID(),
) => {
  const refreshToken = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + configs.jwt.refresh_expires_days * 24 * 60 * 60 * 1000);

  await refresh_token_model.create({
    _id: hashRefreshToken(refreshToken),
    accountId: user.accountId,
    familyId,
    tokenVersion: user.tokenVersion,
    expiresAt,
  });

  res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, { ...refreshCookieOptions, expires: expiresAt });
  const accessToken = issueAccessToken(res, user);
  return { accessToken, refreshToken };
};

export const clearSessionCookies = (res: Response) => {
  clearAccessToken(res);
  res.clearCookie(REFRESH_TOKEN_COOKIE, refreshCookieOptions);
};
