import { createHash } from 'node:crypto';
import passport, { type Profile } from 'passport';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import app from '../../src/app.js';
import {
  account_model,
  social_account_model,
  social_login_code_model,
} from '../../src/app/modules/account/account.schema.js';
import { profile_model } from '../../src/app/modules/profile/profile.schema.js';
import { hashLoginCode } from '../../src/app/passport-js/social-account.js';
import { createAccount, findAccount } from '../helpers/fixtures.js';

const FRONT_END_CALLBACK = 'http://localhost:5173/auth/social/callback';

type Callback = (...args: unknown[]) => void;
type OAuth2Internals = {
  _oauth2: { getOAuthAccessToken: Callback };
  userProfile: Callback;
};
type OAuth1Internals = {
  _oauth: { getOAuthRequestToken: Callback; getOAuthAccessToken: Callback };
  userProfile: Callback;
};
const strategy = <T>(name: string) =>
  (passport as unknown as { _strategy: (n: string) => T })._strategy(name);

/** Calls the node-style callback passed as the last argument. */
const reply =
  (...result: unknown[]) =>
  (...args: unknown[]) =>
    (args.at(-1) as Callback)(null, ...result);

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
  const google = strategy<OAuth2Internals>('google');
  const tokenCall = vi
    .spyOn(google._oauth2, 'getOAuthAccessToken')
    .mockImplementation(reply('access-token', 'refresh-token', {}));
  vi.spyOn(google, 'userProfile').mockImplementation(reply(profile));
  return tokenCall;
};

const firstCookie = (res: request.Response) =>
  ([] as string[]).concat(res.headers['set-cookie'] ?? [])[0]!.split(';')[0]!;

/** Starts a login and returns what the browser would carry back to the callback. */
const startGoogleLogin = async (query = '') => {
  const res = await request(app).get(`/api/auth/social/google${query}`);
  const location = new URL(res.headers.location);
  return { res, location, cookie: firstCookie(res), state: location.searchParams.get('state')! };
};

const finishGoogleLogin = (state: string, cookie: string) =>
  request(app)
    .get(`/api/auth/social/google/callback?code=auth-code&state=${state}`)
    .set('Cookie', cookie);

const loginWithGoogle = async (query = '') => {
  const { cookie, state } = await startGoogleLogin(query);
  return finishGoogleLogin(state, cookie);
};

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
  it('redirects to the provider with state and PKCE, kept in an httpOnly cookie', async () => {
    const { res, location, cookie } = await startGoogleLogin();

    expect(res.status).toBe(302);
    expect(location.host).toBe('accounts.google.com');
    expect(location.searchParams.get('state')).toBeTruthy();
    expect(location.searchParams.get('code_challenge_method')).toBe('S256');
    expect(location.searchParams.get('scope')).toBe('openid email profile');
    expect(cookie).toMatch(/^oauth_google=/);
    expect(res.headers['set-cookie']![0]).toMatch(/HttpOnly/);
    // the cookie is encrypted: the state isn't readable in it
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
  it('creates an account on first login and redirects with a single-use code', async () => {
    const tokenCall = stubGoogle(googleProfile());

    const { location, cookie, state } = await startGoogleLogin('?returnTo=/dashboard');
    const res = await finishGoogleLogin(state, cookie);

    expect(res.status).toBe(302);
    const params = redirectParams(res);
    expect(params.get('returnTo')).toBe('/dashboard');

    const account = await findAccount('jane@example.com');
    expect(account).toMatchObject({ provider: 'GOOGLE', password: null, isAccountVerified: true });
    expect(await profile_model.findOne({ accountId: account!._id }).lean()).toMatchObject({
      fullName: 'Jane Doe',
      profilePhoto: 'https://photos.test/jane.png',
    });
    expect(
      await social_account_model.exists({ provider: 'GOOGLE', providerUserId: 'google-123' }),
    ).toBeTruthy();

    // the code in the URL is stored only as a hash, for the new account
    const code = await social_login_code_model.findById(hashLoginCode(params.get('code')!)).lean();
    expect(String(code!.accountId)).toBe(String(account!._id));

    // PKCE: the verifier sent with the code matches the challenge from the start
    const verifier = (tokenCall.mock.calls[0]![1] as { code_verifier: string }).code_verifier;
    expect(createHash('sha256').update(verifier).digest('base64url')).toBe(
      location.searchParams.get('code_challenge'),
    );
  });

  it('logs a linked identity into its account, even if the email changed', async () => {
    const account = await createAccount();
    await social_account_model.create({
      accountId: account._id,
      provider: 'GOOGLE',
      providerUserId: 'google-123',
    });
    stubGoogle(googleProfile({ emails: [] }));

    const res = await loginWithGoogle();

    const code = redirectParams(res).get('code')!;
    const row = await social_login_code_model.findById(hashLoginCode(code)).lean();
    expect(String(row!.accountId)).toBe(String(account._id));
    expect(await account_model.countDocuments()).toBe(1);
  });

  it('links to an existing unverified account and drops its unproven password', async () => {
    await createAccount({ email: 'jane@example.com', isAccountVerified: false });
    stubGoogle(googleProfile());

    const res = await loginWithGoogle();

    expect(redirectParams(res).get('code')).toBeTruthy();
    expect(await findAccount('jane@example.com')).toMatchObject({
      isAccountVerified: true,
      password: null,
    });
    expect(await social_account_model.countDocuments()).toBe(1);
  });

  it('refuses unverified provider emails', async () => {
    stubGoogle(
      googleProfile({ emails: [{ value: 'jane@example.com', verified: false } as never] }),
    );

    const res = await loginWithGoogle();

    expect(redirectParams(res).get('error')).toBe('email_unverified');
    expect(await account_model.countDocuments()).toBe(0);
  });

  it('refuses deleted accounts', async () => {
    await createAccount({ email: 'jane@example.com', isDeleted: true });
    stubGoogle(googleProfile());

    const res = await loginWithGoogle();

    expect(redirectParams(res).get('error')).toBe('account_disabled');
    expect(await social_login_code_model.countDocuments()).toBe(0);
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

    const res = await loginWithGoogle(`?returnTo=${encodeURIComponent('//evil.com')}`);

    const params = redirectParams(res);
    expect(params.get('code')).toBeTruthy();
    expect(params.get('returnTo')).toBeNull();
  });
});

describe('X (Twitter) login, OAuth 1.0a', () => {
  const twitter = () => strategy<OAuth1Internals>('twitter');

  const startTwitterLogin = async (query = '') => {
    vi.spyOn(twitter()._oauth, 'getOAuthRequestToken').mockImplementation(
      reply('req-token', 'req-secret', {}),
    );
    const res = await request(app).get(`/api/auth/social/twitter${query}`);
    return { res, cookie: firstCookie(res) };
  };

  it('keeps the request token in an encrypted cookie and completes the login', async () => {
    const accessCall = vi
      .spyOn(twitter()._oauth, 'getOAuthAccessToken')
      .mockImplementation(reply('access', 'access-secret', {}));
    vi.spyOn(twitter(), 'userProfile').mockImplementation(
      reply({
        provider: 'twitter',
        id: 'x-1',
        displayName: 'Jane',
        emails: [{ value: 'jane@x.com' }],
      }),
    );

    const { res: start, cookie } = await startTwitterLogin('?returnTo=/home');
    const location = new URL(start.headers.location);
    expect(`${location.origin}${location.pathname}`).toBe(
      'https://api.twitter.com/oauth/authenticate',
    );
    expect(location.searchParams.get('oauth_token')).toBe('req-token');
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
    expect(await findAccount('jane@x.com')).toMatchObject({ provider: 'TWITTER' });
  });

  it('rejects a callback whose token does not match the one in the cookie', async () => {
    const accessCall = vi.spyOn(twitter()._oauth, 'getOAuthAccessToken');
    const { cookie } = await startTwitterLogin();

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
