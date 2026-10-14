import bcrypt from 'bcrypt';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import app from '../../src/app.js';
import { configs } from '../../src/app/configs/index.js';
import {
  account_model,
  refresh_token_model,
  social_login_code_model,
} from '../../src/app/modules/account/account.schema.js';
import { profile_model } from '../../src/app/modules/profile/profile.schema.js';
import { createSocialLoginCode, hashLoginCode } from '../../src/app/passport-js/social-account.js';
import { enqueueEmail } from '../../src/app/queues/email.queue.js';
import { jwtHelpers } from '../../src/app/utils/JWT.js';
import { hashOtp } from '../../src/app/utils/otp.js';
import { hashRefreshToken } from '../../src/app/utils/session.js';
import { bearer, createAccount, findAccount, PASSWORD } from '../helpers/fixtures.js';

/** The `access_token` cookie from a response, if one was set. */
const accessCookie = (res: request.Response) =>
  ([] as string[])
    .concat(res.headers['set-cookie'] ?? [])
    .find((c) => c.startsWith('access_token='));

/** The last email the app queued. */
const lastEmail = () => vi.mocked(enqueueEmail).mock.calls.at(-1)![0];

const signIn = (email: string, password: string) =>
  request(app).post('/api/auth/sign-in').send({ email, password });

describe('POST /api/auth/sign-up', () => {
  const body = { email: 'New@Example.com', password: 'a-strong-password', fullName: 'New User' };

  it('creates the account and profile, and emails a verification OTP', async () => {
    const res = await request(app).post('/api/auth/sign-up').send(body);

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ email: 'new@example.com', isAccountVerified: false });
    expect(res.body.data.password).toBeUndefined();

    const account = await findAccount('new@example.com');
    expect(await bcrypt.compare(body.password, account!.password!)).toBe(true);
    expect(await profile_model.findOne({ accountId: account!._id }).lean()).toMatchObject({
      fullName: 'New User',
    });

    // the OTP is emailed, but only its HMAC is stored
    const job = lastEmail();
    if (job.type !== 'verify-account') throw new Error('unexpected job');
    expect(job.email).toBe('new@example.com');
    expect(job.otp).toMatch(/^\d{6}$/);
    expect(account!.lastOtp).toBe(hashOtp(job.otp));
    expect(job.verificationLink).toContain(`${configs.jwt.front_end_url}/verify?token=`);
  });

  it('rejects invalid input', async () => {
    const res = await request(app)
      .post('/api/auth/sign-up')
      .send({ email: 'not-an-email', password: 'short', fullName: '' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Validation Error');
    expect(res.body.errorSources.map((e: { path: string }) => e.path)).toEqual(
      expect.arrayContaining(['email', 'password', 'fullName']),
    );
    expect(await account_model.countDocuments()).toBe(0);
  });

  it('rejects an email that is already registered, whatever its case', async () => {
    await createAccount({ email: 'taken@example.com' });

    const res = await request(app)
      .post('/api/auth/sign-up')
      .send({ ...body, email: 'TAKEN@example.com' });

    expect(res.status).toBe(409);
    expect(await account_model.countDocuments()).toBe(1);
    expect(enqueueEmail).not.toHaveBeenCalled();
  });
});

describe('POST /api/auth/sign-in', () => {
  it('returns an access token and sets it as an httpOnly cookie', async () => {
    const account = await createAccount();

    const res = await signIn('user@example.com', PASSWORD);

    expect(res.status).toBe(200);
    const payload = jwtHelpers.verifyToken(res.body.data.accessToken, configs.jwt.access_token);
    expect(payload).toMatchObject({ accountId: String(account._id), role: 'USER', tv: 0 });
    expect(accessCookie(res)).toMatch(/HttpOnly/);
  });

  it.each([
    ['a wrong password', {}, 'wrong-password'],
    ['an unknown email', { email: 'other@example.com' }, PASSWORD],
    ['a social account without password', { password: null }, PASSWORD],
  ])('gives the same 401 for %s', async (_case, overrides, password) => {
    await createAccount(overrides);

    const res = await signIn('user@example.com', password);

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid email or password');
    expect(accessCookie(res)).toBeUndefined();
  });

  it('rejects unverified accounts', async () => {
    await createAccount({ isAccountVerified: false });

    const res = await signIn('user@example.com', PASSWORD);

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Account is not verified');
  });

  it('rejects query operators instead of passing them to MongoDB', async () => {
    await createAccount();

    const res = await request(app)
      .post('/api/auth/sign-in')
      .send({ email: { $gt: '' }, password: PASSWORD });

    expect(res.status).toBe(400);
  });
});

describe('PUT /api/auth/verify-otp', () => {
  const unverified = (otp: string, overrides = {}) =>
    createAccount({
      isAccountVerified: false,
      lastOtp: hashOtp(otp),
      lastOtpSendingTime: new Date(),
      ...overrides,
    });

  const verify = (otp: string) =>
    request(app).put('/api/auth/verify-otp').send({ email: 'user@example.com', otp });

  it('verifies the account with the right OTP', async () => {
    await unverified('123456');

    const res = await verify('123456');

    expect(res.status).toBe(200);
    expect(await findAccount()).toMatchObject({
      isAccountVerified: true,
      lastOtp: null,
      otpAttempts: 0,
    });
  });

  it('rejects a wrong OTP and counts the attempt', async () => {
    await unverified('123456');

    const res = await verify('654321');

    expect(res.status).toBe(401);
    expect(await findAccount()).toMatchObject({ isAccountVerified: false, otpAttempts: 1 });
  });

  it('rejects an expired OTP', async () => {
    await unverified('123456', { lastOtpSendingTime: new Date(Date.now() - 10 * 60 * 1000) });

    const res = await verify('123456');

    expect(res.status).toBe(401);
    expect((await findAccount())!.isAccountVerified).toBe(false);
  });

  it('locks the OTP after too many attempts, even with the right code', async () => {
    await unverified('123456', { otpAttempts: 5 });

    const res = await verify('123456');

    expect(res.status).toBe(429);
    expect((await findAccount())!.isAccountVerified).toBe(false);
  });

  it('never allows more than 5 guesses, even in parallel', async () => {
    await unverified('123456');

    const results = await Promise.all(Array.from({ length: 10 }, () => verify('000000')));

    expect(results.filter((r) => r.status === 401)).toHaveLength(5);
    expect(results.filter((r) => r.status === 429)).toHaveLength(5);
    expect((await findAccount())!.otpAttempts).toBe(5);
  });
});

describe('PUT /api/auth/verify-link', () => {
  it('verifies the account with a valid link token', async () => {
    const account = await createAccount({ isAccountVerified: false });
    const token = jwtHelpers.generateToken(
      { purpose: 'verify-account', accountId: String(account._id) },
      configs.jwt.verified_token,
      '5m',
    );

    const res = await request(app).put('/api/auth/verify-link').send({ token });

    expect(res.status).toBe(200);
    expect((await findAccount())!.isAccountVerified).toBe(true);
  });

  it('rejects tokens signed for another purpose', async () => {
    const account = await createAccount({ isAccountVerified: false });
    const accessToken = jwtHelpers.generateToken(
      { accountId: String(account._id) },
      configs.jwt.access_token,
      '5m',
    );

    const res = await request(app).put('/api/auth/verify-link').send({ token: accessToken });

    expect(res.status).toBe(401);
    expect((await findAccount())!.isAccountVerified).toBe(false);
  });
});

describe('GET /api/auth/me', () => {
  it('requires a token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns the signed-in account with its profile, never secrets', async () => {
    const account = await createAccount({ lastOtp: 'secret-hash' });

    const res = await request(app).get('/api/auth/me').set('Authorization', bearer(account));

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: String(account._id),
      email: 'user@example.com',
      profile: { fullName: 'Test User' },
      socialAccounts: [],
    });
    expect(res.body.data).not.toHaveProperty('password');
    expect(res.body.data).not.toHaveProperty('lastOtp');
  });

  it('accepts the token from the cookie', async () => {
    const account = await createAccount();

    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', `access_token=${bearer(account).slice(7)}`);

    expect(res.status).toBe(200);
  });

  it('rejects revoked tokens (token version changed)', async () => {
    const account = await createAccount();
    await account_model.updateOne({ _id: account._id }, { $inc: { tokenVersion: 1 } });

    const res = await request(app).get('/api/auth/me').set('Authorization', bearer(account));

    expect(res.status).toBe(401);
  });

  it('rejects deleted accounts', async () => {
    const account = await createAccount({ isDeleted: true });

    const res = await request(app).get('/api/auth/me').set('Authorization', bearer(account));

    expect(res.status).toBe(401);
  });
});

describe('PUT /api/auth/change-password', () => {
  it('changes the password, revokes other sessions and issues a new token', async () => {
    const account = await createAccount();
    const oldToken = bearer(account);

    const res = await request(app)
      .put('/api/auth/change-password')
      .set('Authorization', oldToken)
      .send({ oldPassword: PASSWORD, newPassword: 'another-strong-password' });

    expect(res.status).toBe(200);
    const stored = await findAccount();
    expect(stored!.tokenVersion).toBe(1);
    expect(await bcrypt.compare('another-strong-password', stored!.password!)).toBe(true);

    const fresh = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${res.body.data.accessToken}`);
    const stale = await request(app).get('/api/auth/me').set('Authorization', oldToken);
    expect(fresh.status).toBe(200);
    expect(stale.status).toBe(401);
  });

  it('rejects a wrong old password', async () => {
    const account = await createAccount();

    const res = await request(app)
      .put('/api/auth/change-password')
      .set('Authorization', bearer(account))
      .send({ oldPassword: 'not-my-password', newPassword: 'another-strong-password' });

    expect(res.status).toBe(401);
    expect((await findAccount())!.tokenVersion).toBe(0);
  });
});

describe('PUT /api/auth/resend-otp', () => {
  it('answers the same for unknown emails, without sending anything', async () => {
    const res = await request(app)
      .put('/api/auth/resend-otp')
      .send({ email: 'nobody@example.com' });

    expect(res.status).toBe(200);
    expect(enqueueEmail).not.toHaveBeenCalled();
  });

  it('sends a new OTP to unverified accounts', async () => {
    await createAccount({ isAccountVerified: false, lastOtp: 'old-hash' });

    const res = await request(app).put('/api/auth/resend-otp').send({ email: 'user@example.com' });

    expect(res.status).toBe(200);
    const job = lastEmail();
    if (job.type !== 'verify-account') throw new Error('unexpected job');
    expect((await findAccount())!.lastOtp).toBe(hashOtp(job.otp));
  });

  it('enforces the resend cooldown', async () => {
    await createAccount({ isAccountVerified: false, lastOtpSendingTime: new Date() });

    const res = await request(app).put('/api/auth/resend-otp').send({ email: 'user@example.com' });

    expect(res.status).toBe(429);
    expect(enqueueEmail).not.toHaveBeenCalled();
  });
});

describe('password reset', () => {
  const requestReset = async (email = 'user@example.com') => {
    await request(app).put('/api/auth/forget-password').send({ email }).expect(200);
    const job = lastEmail();
    if (job.type !== 'reset-password') throw new Error('unexpected job');
    return decodeURIComponent(new URL(job.resetLink).searchParams.get('token')!);
  };

  const reset = (token: string, newPass = 'brand-new-password') =>
    request(app).put('/api/auth/reset-password').send({ token, newPass });

  it('answers the same for unknown emails, without sending anything', async () => {
    const res = await request(app)
      .put('/api/auth/forget-password')
      .send({ email: 'nobody@example.com' });

    expect(res.status).toBe(200);
    expect(enqueueEmail).not.toHaveBeenCalled();
  });

  it('resets the password through the emailed link, which works only once', async () => {
    const account = await createAccount({ isAccountVerified: false });
    const oldToken = bearer(account);
    const token = await requestReset();

    expect((await reset(token)).status).toBe(200);
    expect((await signIn('user@example.com', 'brand-new-password')).status).toBe(200);

    // the link is used up, the account is verified, and old sessions are revoked
    expect((await reset(token, 'yet-another-password')).status).toBe(401);
    expect((await findAccount())!.isAccountVerified).toBe(true);
    expect((await request(app).get('/api/auth/me').set('Authorization', oldToken)).status).toBe(
      401,
    );
  });

  it('only ever resets the account the link was issued for', async () => {
    await createAccount();
    await createAccount({ email: 'victim@example.com' });
    const token = await requestReset();

    // an extra `email` in the body (as the old API accepted) is ignored
    const res = await request(app)
      .put('/api/auth/reset-password')
      .send({ token, newPass: 'attacker-password', email: 'victim@example.com' });

    expect(res.status).toBe(200);
    expect((await signIn('victim@example.com', 'attacker-password')).status).toBe(401);
    expect((await signIn('victim@example.com', PASSWORD)).status).toBe(200);
  });

  it('rejects a forged token', async () => {
    await createAccount();

    expect((await reset('not.a.jwt')).status).toBe(401);
    expect((await signIn('user@example.com', PASSWORD)).status).toBe(200);
  });
});

describe('sign out', () => {
  it('POST /sign-out clears the cookie', async () => {
    const res = await request(app).post('/api/auth/sign-out');

    expect(res.status).toBe(200);
    expect(accessCookie(res)).toMatch(/access_token=;.*Expires=Thu, 01 Jan 1970/);
  });

  it('POST /sign-out-all revokes every token of the account', async () => {
    const account = await createAccount();
    const token = bearer(account);

    const res = await request(app).post('/api/auth/sign-out-all').set('Authorization', token);

    expect(res.status).toBe(200);
    expect((await request(app).get('/api/auth/me').set('Authorization', token)).status).toBe(401);
  });
});

describe('POST /api/auth/social/exchange', () => {
  const exchange = (code: string) => request(app).post('/api/auth/social/exchange').send({ code });

  it('trades a valid code for an access token, once', async () => {
    const account = await createAccount();
    const code = await createSocialLoginCode(String(account._id));

    const res = await exchange(code);

    expect(res.status).toBe(200);
    const payload = jwtHelpers.verifyToken(res.body.data.accessToken, configs.jwt.access_token);
    expect(payload.accountId).toBe(String(account._id));
    expect(accessCookie(res)).toBeDefined();
    expect((await exchange(code)).status).toBe(401);
  });

  it('rejects unknown codes', async () => {
    expect((await exchange('made-up')).status).toBe(401);
  });

  it('rejects expired codes', async () => {
    const account = await createAccount();
    await social_login_code_model.create({
      _id: hashLoginCode('old'),
      accountId: account._id,
      expiresAt: new Date(Date.now() - 1000),
    });

    expect((await exchange('old')).status).toBe(401);
  });
});

describe('refresh tokens', () => {
  const refreshCookie = (res: request.Response) =>
    ([] as string[])
      .concat(res.headers['set-cookie'] ?? [])
      .find((c) => c.startsWith('refresh_token='));

  const refresh = (token: string) =>
    request(app).post('/api/auth/refresh-token').set('Cookie', `refresh_token=${token}`);

  /** Signs in (a new device / session) and returns its refresh token. */
  const startSession = async () => {
    const res = await signIn('user@example.com', PASSWORD);
    expect(res.status).toBe(200);
    return res.body.data.refreshToken as string;
  };

  /** Pretends the token was rotated `ms` ago. */
  const usedAgo = (token: string, ms: number) =>
    refresh_token_model.updateOne(
      { _id: hashRefreshToken(token) },
      { $set: { usedAt: new Date(Date.now() - ms) } },
    );

  it('sign-in starts a session: refresh token in an httpOnly cookie, stored hashed', async () => {
    await createAccount();

    const res = await signIn('user@example.com', PASSWORD);

    const { refreshToken } = res.body.data;
    expect(refreshCookie(res)).toMatch(/HttpOnly/);
    expect(refreshCookie(res)).toMatch(/Path=\/api\/auth/);
    expect(await refresh_token_model.exists({ _id: hashRefreshToken(refreshToken) })).toBeTruthy();
    expect(await refresh_token_model.exists({ _id: refreshToken })).toBeNull();
  });

  it('rotates the token on every refresh, within the same session', async () => {
    await createAccount();
    const first = await startSession();

    const res = await refresh(first);

    expect(res.status).toBe(200);
    const second = res.body.data.refreshToken;
    expect(second).not.toBe(first);
    expect(refreshCookie(res)).toContain(second);
    const [a, b] = await Promise.all([
      refresh_token_model.findById(hashRefreshToken(first)).lean(),
      refresh_token_model.findById(hashRefreshToken(second)).lean(),
    ]);
    expect(a!.usedAt).not.toBeNull();
    expect(b!.familyId).toBe(a!.familyId);

    // the new access token works, and so does the next refresh
    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${res.body.data.accessToken}`);
    expect(me.status).toBe(200);
    expect((await refresh(second)).status).toBe(200);
  });

  it('accepts the refresh token in the body (non-browser clients)', async () => {
    await createAccount();
    const token = await startSession();

    const res = await request(app).post('/api/auth/refresh-token').send({ refreshToken: token });

    expect(res.status).toBe(200);
  });

  it('ends the whole session when a rotated token is reused (theft)', async () => {
    await createAccount();
    const stolen = await startSession();
    const current = (await refresh(stolen)).body.data.refreshToken;
    await usedAgo(stolen, 60_000);

    expect((await refresh(stolen)).status).toBe(401);
    // the legitimate user's token from the same session is revoked too
    expect((await refresh(current)).status).toBe(401);
  });

  it('does not end the session for a parallel refresh within the grace window', async () => {
    await createAccount();
    const first = await startSession();
    const second = (await refresh(first)).body.data.refreshToken;

    expect((await refresh(first)).status).toBe(401);
    expect((await refresh(second)).status).toBe(200);
  });

  it('gives a new token to only one of several parallel refreshes', async () => {
    await createAccount();
    const token = await startSession();

    const results = await Promise.all(Array.from({ length: 5 }, () => refresh(token)));

    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(await refresh_token_model.countDocuments({ usedAt: null })).toBe(1);
  });

  it('rejects expired tokens', async () => {
    await createAccount();
    const token = await startSession();
    await refresh_token_model.updateOne(
      { _id: hashRefreshToken(token) },
      { $set: { expiresAt: new Date(Date.now() - 1000) } },
    );

    expect((await refresh(token)).status).toBe(401);
  });

  it('rejects unknown or missing tokens', async () => {
    expect((await refresh('made-up')).status).toBe(401);
    expect((await request(app).post('/api/auth/refresh-token')).status).toBe(401);
  });

  it('a password change revokes every session but starts a new one', async () => {
    const account = await createAccount();
    const otherDevice = await startSession();

    const res = await request(app)
      .put('/api/auth/change-password')
      .set('Authorization', bearer(account))
      .send({ oldPassword: PASSWORD, newPassword: 'another-strong-password' });

    expect(res.status).toBe(200);
    expect((await refresh(otherDevice)).status).toBe(401);
    expect((await refresh(res.body.data.refreshToken)).status).toBe(200);
  });

  it('sign-out ends only this device, and clears both cookies', async () => {
    await createAccount();
    const thisDevice = await startSession();
    const otherDevice = await startSession();

    const res = await request(app)
      .post('/api/auth/sign-out')
      .set('Cookie', `refresh_token=${thisDevice}`);

    expect(res.status).toBe(200);
    expect(refreshCookie(res)).toMatch(/refresh_token=;.*Expires=Thu, 01 Jan 1970/);
    expect((await refresh(thisDevice)).status).toBe(401);
    expect((await refresh(otherDevice)).status).toBe(200);
  });

  it('sign-out-all ends every session', async () => {
    const account = await createAccount();
    const one = await startSession();
    const two = await startSession();

    await request(app)
      .post('/api/auth/sign-out-all')
      .set('Authorization', bearer(account))
      .expect(200);

    expect((await refresh(one)).status).toBe(401);
    expect((await refresh(two)).status).toBe(401);
  });

  it('a social login code exchange starts a session too', async () => {
    const account = await createAccount();
    const code = await createSocialLoginCode(String(account._id));

    const res = await request(app).post('/api/auth/social/exchange').send({ code });

    expect((await refresh(res.body.data.refreshToken)).status).toBe(200);
  });
});
