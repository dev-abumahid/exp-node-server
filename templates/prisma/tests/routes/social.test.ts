import { createHash } from 'node:crypto';
import passport, { type Profile } from 'passport';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../../src/app.js';
import { hashLoginCode } from '../../src/app/passport-js/social-account.js';
import { makeAccount } from '../helpers/fixtures.js';
import { prismaMock } from '../helpers/prisma.js';

const FRONT_END_CALLBACK = 'http://localhost:5173/auth/social/callback';

type OAuth2Internals = {
  _oauth2: { getOAuthAccessToken: (...args: unknown[]) => void };
  userProfile: (token: string, done: (err: unknown, profile?: Profile) => void) => void;
};
const strategy = (name: string) =>
  (passport as unknown as { _strategy: (n: string) => OAuth2Internals })._strategy(name);

const googleProfile = (overrides: Partial<Profile> = {}): Profile => ({
  provider: 'google',
  id: 'google-123',
  displayName: 'Jane Doe',
  emails: [{ value: 'Jane@Example.com', verified: true } as never],
  photos: [{ value: 'https://photos.test/jane.png' }],
  ...overrides,
});

/** Stubs the provider's HTTP calls (code -> token, token -> profile). */
const stubGoogle = (profile: Profile) => {
  const google = strategy('google');
  const tokenCall = vi
    .spyOn(google._oauth2, 'getOAuthAccessToken')
    .mockImplementation((...args: unknown[]) => {
      const cb = args[2] as (err: unknown, access: string, refresh: string, params: object) => void;
      cb(null, 'access-token', 'refresh-token', {});
    });
  vi.spyOn(google, 'userProfile').mockImplementation((_token, done) => done(null, profile));
  return tokenCall;
};

/** Starts a login and returns what the browser would carry back to the callback. */
const startGoogleLogin = async (query = '') => {
  const res = await request(app).get(`/api/auth/social/google${query}`);
  const location = new URL(res.headers.location);
  const cookie = ([] as string[]).concat(res.headers['set-cookie'] ?? [])[0]!.split(';')[0]!;
  return { res, location, cookie, state: location.searchParams.get('state')! };
};

const finishGoogleLogin = (state: string, cookie: string) =>
  request(app)
    .get(`/api/auth/social/google/callback?code=auth-code&state=${state}`)
    .set('Cookie', cookie);

const redirectParams = (res: request.Response) => {
  const url = new URL(res.headers.location);
  expect(`${url.origin}${url.pathname}`).toBe(FRONT_END_CALLBACK);
  return url.searchParams;
};

describe('GET /api/auth/social/providers', () => {
  it('lists only the enabled providers', async () => {
    const res = await request(app).get('/api/auth/social/providers');

    expect(res.status).toBe(200);
    expect(res.body.data.map((p: { name: string }) => p.name)).toEqual([
      'google',
      'github',
      'twitter',
    ]);
  });

  it('has no routes for disabled providers', async () => {
    const res = await request(app).get('/api/auth/social/facebook');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/auth/social/<provider>', () => {
  it('redirects to the provider with state and PKCE, keeping them in an httpOnly cookie', async () => {
    const { res, location, cookie } = await startGoogleLogin();

    expect(res.status).toBe(302);
    expect(location.host).toBe('accounts.google.com');
    expect(location.searchParams.get('state')).toBeTruthy();
    expect(location.searchParams.get('code_challenge_method')).toBe('S256');
    expect(location.searchParams.get('scope')).toBe('openid email profile');
    expect(cookie).toMatch(/^oauth_google=/);
    expect(res.headers['set-cookie']![0]).toMatch(/HttpOnly/);
    // the cookie is encrypted: neither the state nor the verifier are readable
    expect(cookie).not.toContain(location.searchParams.get('state'));
  });

  it('uses state (no PKCE) for GitHub', async () => {
    const res = await request(app).get('/api/auth/social/github');
    const location = new URL(res.headers.location);

    expect(location.host).toBe('github.com');
    expect(location.searchParams.get('state')).toBeTruthy();
    expect(location.searchParams.get('code_challenge')).toBeNull();
  });
});

describe('GET /api/auth/social/<provider>/callback', () => {
  beforeEach(() => {
    prismaMock.socialLoginCode.create.mockResolvedValue({});
  });

  it('creates an account on first login and redirects with a single-use code', async () => {
    const tokenCall = stubGoogle(googleProfile());
    prismaMock.socialAccount.findUnique.mockResolvedValue(null);
    prismaMock.account.findUnique.mockResolvedValue(null);
    prismaMock.account.create.mockResolvedValue(makeAccount({ id: 'new-acc', password: null }));

    const { location, cookie, state } = await startGoogleLogin('?returnTo=/dashboard');
    const res = await finishGoogleLogin(state, cookie);

    expect(res.status).toBe(302);
    const params = redirectParams(res);
    expect(params.get('returnTo')).toBe('/dashboard');

    // the code in the URL is stored only as a hash, for the new account
    const code = params.get('code')!;
    expect(prismaMock.socialLoginCode.create.mock.calls[0]![0].data).toMatchObject({
      codeHash: hashLoginCode(code),
      accountId: 'new-acc',
    });

    // PKCE: the verifier sent with the code matches the challenge from the start
    const verifier = (tokenCall.mock.calls[0]![1] as { code_verifier: string }).code_verifier;
    expect(createHash('sha256').update(verifier).digest('base64url')).toBe(
      location.searchParams.get('code_challenge'),
    );

    const { data } = prismaMock.account.create.mock.calls[0]![0];
    expect(data).toMatchObject({
      email: 'jane@example.com',
      password: null,
      provider: 'GOOGLE',
      isAccountVerified: true,
      socialAccounts: { create: { provider: 'GOOGLE', providerUserId: 'google-123' } },
    });
  });

  it('logs a linked identity into its account, even if the email changed', async () => {
    stubGoogle(googleProfile({ emails: [] }));
    prismaMock.socialAccount.findUnique.mockResolvedValue({ account: makeAccount() });

    const { cookie, state } = await startGoogleLogin();
    const res = await finishGoogleLogin(state, cookie);

    expect(redirectParams(res).get('code')).toBeTruthy();
    expect(prismaMock.account.create).not.toHaveBeenCalled();
  });

  it('links to an existing unverified account and drops its unproven password', async () => {
    stubGoogle(googleProfile());
    prismaMock.socialAccount.findUnique.mockResolvedValue(null);
    prismaMock.account.findUnique.mockResolvedValue(makeAccount({ isAccountVerified: false }));
    prismaMock.account.update.mockResolvedValue(makeAccount({ password: null }));

    const { cookie, state } = await startGoogleLogin();
    await finishGoogleLogin(state, cookie);

    expect(prismaMock.account.update.mock.calls[0]![0].data).toMatchObject({
      isAccountVerified: true,
      password: null,
      socialAccounts: { create: { provider: 'GOOGLE', providerUserId: 'google-123' } },
    });
  });

  it('refuses unverified provider emails', async () => {
    stubGoogle(
      googleProfile({ emails: [{ value: 'jane@example.com', verified: false } as never] }),
    );
    prismaMock.socialAccount.findUnique.mockResolvedValue(null);

    const { cookie, state } = await startGoogleLogin();
    const res = await finishGoogleLogin(state, cookie);

    expect(redirectParams(res).get('error')).toBe('email_unverified');
    expect(prismaMock.account.create).not.toHaveBeenCalled();
  });

  it('refuses deleted accounts', async () => {
    stubGoogle(googleProfile());
    prismaMock.socialAccount.findUnique.mockResolvedValue({
      account: makeAccount({ isDeleted: true }),
    });

    const { cookie, state } = await startGoogleLogin();
    const res = await finishGoogleLogin(state, cookie);

    expect(redirectParams(res).get('error')).toBe('account_disabled');
    expect(prismaMock.socialLoginCode.create).not.toHaveBeenCalled();
  });

  it('rejects a callback whose state does not match (login CSRF)', async () => {
    const tokenCall = stubGoogle(googleProfile());
    const { cookie } = await startGoogleLogin();

    const res = await finishGoogleLogin('attacker-state', cookie);

    expect(redirectParams(res).get('error')).toBe('invalid_state');
    expect(tokenCall).not.toHaveBeenCalled();
  });

  it('rejects a callback without the state cookie', async () => {
    const tokenCall = stubGoogle(googleProfile());
    const { state } = await startGoogleLogin();

    const res = await request(app).get(
      `/api/auth/social/google/callback?code=auth-code&state=${state}`,
    );

    expect(redirectParams(res).get('error')).toBe('invalid_state');
    expect(tokenCall).not.toHaveBeenCalled();
  });

  it('reports when the user cancels at the provider', async () => {
    const res = await request(app).get('/api/auth/social/google/callback?error=access_denied');

    expect(redirectParams(res).get('error')).toBe('access_denied');
  });

  it('never redirects to another site through returnTo', async () => {
    stubGoogle(googleProfile());
    prismaMock.socialAccount.findUnique.mockResolvedValue({ account: makeAccount() });

    const { cookie, state } = await startGoogleLogin(
      `?returnTo=${encodeURIComponent('//evil.com')}`,
    );
    const res = await finishGoogleLogin(state, cookie);

    const params = redirectParams(res);
    expect(params.get('code')).toBeTruthy();
    expect(params.get('returnTo')).toBeNull();
  });
});

describe('X (Twitter) login, OAuth 1.0a', () => {
  type OAuth1Internals = {
    _oauth: {
      getOAuthRequestToken: (...args: unknown[]) => void;
      getOAuthAccessToken: (...args: unknown[]) => void;
    };
    userProfile: (...args: unknown[]) => void;
  };
  const twitter = () =>
    (passport as unknown as { _strategy: (n: string) => OAuth1Internals })._strategy('twitter');

  it('keeps the request token in an encrypted cookie and completes the login', async () => {
    const t = twitter();
    vi.spyOn(t._oauth, 'getOAuthRequestToken').mockImplementation((...args: unknown[]) => {
      (args.at(-1) as (...a: unknown[]) => void)(null, 'req-token', 'req-secret', {});
    });
    const accessCall = vi
      .spyOn(t._oauth, 'getOAuthAccessToken')
      .mockImplementation((...args: unknown[]) => {
        (args.at(-1) as (...a: unknown[]) => void)(null, 'access', 'access-secret', {});
      });
    vi.spyOn(t, 'userProfile').mockImplementation((...args: unknown[]) => {
      (args.at(-1) as (...a: unknown[]) => void)(null, {
        provider: 'twitter',
        id: 'x-1',
        displayName: 'Jane',
        emails: [{ value: 'jane@example.com' }],
      });
    });
    prismaMock.socialAccount.findUnique.mockResolvedValue({ account: makeAccount() });
    prismaMock.socialLoginCode.create.mockResolvedValue({});

    const start = await request(app).get('/api/auth/social/twitter?returnTo=/home');
    expect(start.status).toBe(302);
    const location = new URL(start.headers.location);
    expect(`${location.origin}${location.pathname}`).toBe(
      'https://api.twitter.com/oauth/authenticate',
    );
    expect(location.searchParams.get('oauth_token')).toBe('req-token');
    const cookie = ([] as string[]).concat(start.headers['set-cookie'] ?? [])[0]!.split(';')[0]!;
    expect(cookie).toMatch(/^oauth_twitter=/);
    expect(cookie).not.toContain('req-secret');

    const res = await request(app)
      .get('/api/auth/social/twitter/callback?oauth_token=req-token&oauth_verifier=v')
      .set('Cookie', cookie);

    // the token secret from the cookie was used to get the access token
    expect(accessCall.mock.calls[0]!.slice(0, 3)).toEqual(['req-token', 'req-secret', 'v']);
    const params = redirectParams(res);
    expect(params.get('code')).toBeTruthy();
    expect(params.get('returnTo')).toBe('/home');
  });

  it('rejects a callback whose token does not match the one in the cookie', async () => {
    vi.spyOn(twitter()._oauth, 'getOAuthRequestToken').mockImplementation((...args: unknown[]) => {
      (args.at(-1) as (...a: unknown[]) => void)(null, 'req-token', 'req-secret', {});
    });
    const accessCall = vi.spyOn(twitter()._oauth, 'getOAuthAccessToken');
    const start = await request(app).get('/api/auth/social/twitter');
    const cookie = ([] as string[]).concat(start.headers['set-cookie'] ?? [])[0]!.split(';')[0]!;

    const res = await request(app)
      .get('/api/auth/social/twitter/callback?oauth_token=other-token&oauth_verifier=v')
      .set('Cookie', cookie);

    expect(redirectParams(res).get('error')).toBe('invalid_state');
    expect(accessCall).not.toHaveBeenCalled();
  });

  it('rejects a callback for a request token it did not issue', async () => {
    const res = await request(app).get(
      '/api/auth/social/twitter/callback?oauth_token=forged&oauth_verifier=v',
    );

    expect(redirectParams(res).get('error')).toBe('invalid_state');
  });
});
