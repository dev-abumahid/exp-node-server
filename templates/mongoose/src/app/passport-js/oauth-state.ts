import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import type { CookieOptions, Request, Response } from 'express';
import { configs } from '../configs/index.js';

/**
 * Stateless OAuth handshake storage. Instead of a server-side session, the data a
 * provider round trip needs (CSRF state, PKCE verifier, OAuth 1.0a request token)
 * lives in a short-lived, encrypted, httpOnly cookie scoped to the social routes.
 * Works across instances and restarts, and nothing accumulates in memory.
 */

const STATE_TTL_MS = 10 * 60 * 1000;

// separate key for this purpose, derived from the access token secret
const key = Buffer.from(hkdfSync('sha256', configs.jwt.access_token, '', 'oauth-state-cookie', 32));

const cookieOptions: CookieOptions = {
  httpOnly: true,
  secure: configs.is_production,
  // the provider sends the user back with a top-level GET, which `lax` allows
  sameSite: 'lax',
  path: '/api/auth/social',
};

const cookieName = (provider: string) => `oauth_${provider}`;

const seal = (data: object): string => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = JSON.stringify({ ...data, exp: Date.now() + STATE_TTL_MS });
  const encrypted = Buffer.concat([cipher.update(body, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
};

const unseal = <T>(value: unknown): T | undefined => {
  if (typeof value !== 'string') return undefined;
  try {
    const raw = Buffer.from(value, 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const body = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]);
    const data = JSON.parse(body.toString('utf8'));
    return data.exp > Date.now() ? data : undefined;
  } catch {
    return undefined; // tampered, wrong key or malformed
  }
};

const res = (req: Request): Response => req.res!;

/** Reads and clears the handshake cookie, so it can only be used once. */
const take = <T>(req: Request, provider: string): T | undefined => {
  res(req).clearCookie(cookieName(provider), cookieOptions);
  return unseal<T>(req.cookies?.[cookieName(provider)]);
};

const put = (req: Request, provider: string, data: object) => {
  res(req).cookie(cookieName(provider), seal(data), { ...cookieOptions, maxAge: STATE_TTL_MS });
};

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/**
 * `?returnTo=` lets the front-end resume where the user was. Only same-site paths
 * are kept (no `//host` or `\` tricks), so it can't become an open redirect.
 */
const readReturnTo = (req: Request): string | undefined => {
  const value = req.query.returnTo;
  if (typeof value !== 'string' || value.length > 512) return undefined;
  return /^\/(?![/\\])[^\\]*$/.test(value) ? value : undefined;
};

/** The `returnTo` saved when the login started, available in the callback. */
export const getReturnTo = (res: Response): string | undefined => res.locals.oauthReturnTo;

type OAuth2State = { handle: string; verifier?: string; returnTo?: string };

/** passport-oauth2 state store: `state` parameter (CSRF) + PKCE verifier. */
export class CookieStateStore {
  constructor(private readonly provider: string) {}

  store(
    req: Request,
    verifier: string | undefined,
    _state: unknown,
    _meta: unknown,
    callback: (err: Error | null, handle?: string) => void,
  ) {
    const handle = randomBytes(24).toString('base64url');
    put(req, this.provider, {
      handle,
      verifier,
      returnTo: readReturnTo(req),
    } satisfies OAuth2State);
    callback(null, handle);
  }

  verify(
    req: Request,
    providedState: unknown,
    callback: (err: Error | null, ok: string | boolean, info?: { message: string }) => void,
  ) {
    const saved = take<OAuth2State>(req, this.provider);
    if (!saved || typeof providedState !== 'string' || !safeEqual(saved.handle, providedState)) {
      return callback(null, false, { message: 'invalid_state' });
    }
    res(req).locals.oauthReturnTo = saved.returnTo;
    // a string tells passport-oauth2 to send it as the PKCE `code_verifier`
    callback(null, saved.verifier ?? true);
  }
}

type OAuth1State = { token: string; tokenSecret: string; returnTo?: string };

/** passport-oauth1 request token store (Twitter / X). */
export class CookieRequestTokenStore {
  constructor(private readonly provider: string) {}

  get(req: Request, token: string, callback: (err: Error | null, tokenSecret?: string) => void) {
    const saved = take<OAuth1State>(req, this.provider);
    if (!saved || typeof token !== 'string' || !safeEqual(saved.token, token)) {
      return callback(new Error('invalid_state'));
    }
    res(req).locals.oauthReturnTo = saved.returnTo;
    callback(null, saved.tokenSecret);
  }

  set(req: Request, token: string, tokenSecret: string, callback: (err?: Error) => void) {
    put(req, this.provider, {
      token,
      tokenSecret,
      returnTo: readReturnTo(req),
    } satisfies OAuth1State);
    callback();
  }

  destroy(_req: Request, _token: string, callback: (err?: Error) => void) {
    callback(); // already cleared by get()
  }
}
