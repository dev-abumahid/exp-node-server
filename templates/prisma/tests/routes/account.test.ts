import { Prisma } from '@prisma/client';
import bcrypt from 'bcrypt';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import app from '../../src/app.js';
import { configs } from '../../src/app/configs/index.js';
import { hashLoginCode } from '../../src/app/passport-js/social-account.js';
import { enqueueEmail } from '../../src/app/queues/email.queue.js';
import { jwtHelpers } from '../../src/app/utils/JWT.js';
import { hashOtp } from '../../src/app/utils/otp.js';
import { hashRefreshToken } from '../../src/app/utils/session.js';
import { bearer, makeAccount, PASSWORD } from '../helpers/fixtures.js';
import { prismaMock } from '../helpers/prisma.js';

const db = prismaMock.account;

/** The `access_token` cookie from a response, if one was set. */
const accessCookie = (res: request.Response) =>
  ([] as string[])
    .concat(res.headers['set-cookie'] ?? [])
    .find((c) => c.startsWith('access_token='));

describe('POST /api/auth/sign-up', () => {
  const body = { email: 'New@Example.com', password: 'a-strong-password', fullName: 'New User' };

  it('creates the account with a hashed password and emails a verification OTP', async () => {
    db.findUnique.mockResolvedValue(null);
    db.create.mockImplementation(async ({ data }) => ({
      id: data.id,
      email: data.email,
      role: 'USER',
      isAccountVerified: false,
      profile: { fullName: 'New User' },
    }));

    const res = await request(app).post('/api/auth/sign-up').send(body);

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ email: 'new@example.com', isAccountVerified: false });
    expect(res.body.data.password).toBeUndefined();

    const { data } = db.create.mock.calls[0]![0];
    expect(data.email).toBe('new@example.com'); // normalised
    expect(await bcrypt.compare(body.password, data.password)).toBe(true);

    // the OTP is emailed, but only its HMAC is stored
    const job = vi.mocked(enqueueEmail).mock.calls[0]![0];
    expect(job).toMatchObject({ type: 'verify-account', email: 'new@example.com' });
    if (job.type !== 'verify-account') throw new Error('unexpected job');
    expect(job.otp).toMatch(/^\d{6}$/);
    expect(data.lastOtp).toBe(hashOtp(job.otp));
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
    expect(db.create).not.toHaveBeenCalled();
  });

  it('rejects an email that is already registered', async () => {
    db.findUnique.mockResolvedValue({ id: 'acc-1' });

    const res = await request(app)
      .post('/api/auth/sign-up')
      .send({ ...body, email: 'taken@example.com' });

    expect(res.status).toBe(409);
    expect(db.create).not.toHaveBeenCalled();
    expect(enqueueEmail).not.toHaveBeenCalled();
  });
});

describe('POST /api/auth/sign-in', () => {
  it('returns an access token and sets it as an httpOnly cookie', async () => {
    db.findUnique.mockResolvedValue(makeAccount());

    const res = await request(app)
      .post('/api/auth/sign-in')
      .send({ email: 'user@example.com', password: PASSWORD });

    expect(res.status).toBe(200);
    const payload = jwtHelpers.verifyToken(res.body.data.accessToken, configs.jwt.access_token);
    expect(payload).toMatchObject({ accountId: 'acc-1', role: 'USER', tv: 0 });
    expect(accessCookie(res)).toMatch(/HttpOnly/);
  });

  it.each([
    ['a wrong password', makeAccount(), 'wrong-password'],
    ['an unknown email', null, PASSWORD],
    ['a social account without password', makeAccount({ password: null }), PASSWORD],
  ])('gives the same 401 for %s', async (_case, account, password) => {
    db.findUnique.mockResolvedValue(account);

    const res = await request(app)
      .post('/api/auth/sign-in')
      .send({ email: 'user@example.com', password });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid email or password');
    expect(accessCookie(res)).toBeUndefined();
  });

  it('rejects unverified accounts', async () => {
    db.findUnique.mockResolvedValue(makeAccount({ isAccountVerified: false }));

    const res = await request(app)
      .post('/api/auth/sign-in')
      .send({ email: 'user@example.com', password: PASSWORD });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Account is not verified');
  });
});

describe('PUT /api/auth/verify-otp', () => {
  const otpAccount = (otp: string, overrides = {}) =>
    makeAccount({
      isAccountVerified: false,
      lastOtp: hashOtp(otp),
      lastOtpSendingTime: new Date(),
      ...overrides,
    });

  it('verifies the account with the right OTP', async () => {
    db.findUnique.mockResolvedValue(otpAccount('123456'));
    db.updateMany.mockResolvedValue({ count: 1 });

    const res = await request(app)
      .put('/api/auth/verify-otp')
      .send({ email: 'user@example.com', otp: '123456' });

    expect(res.status).toBe(200);
    expect(db.updateMany).toHaveBeenLastCalledWith({
      where: { id: 'acc-1', lastOtp: hashOtp('123456') },
      data: { isAccountVerified: true, lastOtp: null, otpAttempts: 0 },
    });
  });

  it('rejects a wrong OTP and counts the attempt', async () => {
    db.findUnique.mockResolvedValue(otpAccount('123456'));
    db.updateMany.mockResolvedValue({ count: 1 });

    const res = await request(app)
      .put('/api/auth/verify-otp')
      .send({ email: 'user@example.com', otp: '654321' });

    expect(res.status).toBe(401);
    expect(db.updateMany).toHaveBeenCalledTimes(1);
    expect(db.updateMany.mock.calls[0]![0].data).toEqual({ otpAttempts: { increment: 1 } });
  });

  it('rejects an expired OTP', async () => {
    db.findUnique.mockResolvedValue(
      otpAccount('123456', { lastOtpSendingTime: new Date(Date.now() - 10 * 60 * 1000) }),
    );

    const res = await request(app)
      .put('/api/auth/verify-otp')
      .send({ email: 'user@example.com', otp: '123456' });

    expect(res.status).toBe(401);
    expect(db.updateMany).not.toHaveBeenCalled();
  });

  it('locks the OTP after too many attempts, even with the right code', async () => {
    db.findUnique.mockResolvedValue(otpAccount('123456', { otpAttempts: 5 }));
    db.updateMany.mockResolvedValue({ count: 0 }); // no attempts left

    const res = await request(app)
      .put('/api/auth/verify-otp')
      .send({ email: 'user@example.com', otp: '123456' });

    expect(res.status).toBe(429);
  });
});

describe('PUT /api/auth/verify-link', () => {
  it('verifies the account with a valid link token', async () => {
    db.updateMany.mockResolvedValue({ count: 1 });
    const token = jwtHelpers.generateToken(
      { purpose: 'verify-account', accountId: 'acc-1' },
      configs.jwt.verified_token,
      '5m',
    );

    const res = await request(app).put('/api/auth/verify-link').send({ token });

    expect(res.status).toBe(200);
    expect(db.updateMany.mock.calls[0]![0].where).toEqual({ id: 'acc-1', isDeleted: false });
  });

  it('rejects tokens signed for another purpose', async () => {
    const accessToken = jwtHelpers.generateToken(
      { accountId: 'acc-1' },
      configs.jwt.access_token,
      '5m',
    );

    const res = await request(app).put('/api/auth/verify-link').send({ token: accessToken });

    expect(res.status).toBe(401);
    expect(db.updateMany).not.toHaveBeenCalled();
  });
});

describe('GET /api/auth/me', () => {
  it('requires a token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns the signed-in account', async () => {
    const account = makeAccount();
    db.findUnique.mockResolvedValue(account);

    const res = await request(app).get('/api/auth/me').set('Authorization', bearer(account));

    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe('user@example.com');
  });

  it('accepts the token from the cookie', async () => {
    const account = makeAccount();
    db.findUnique.mockResolvedValue(account);

    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', `access_token=${bearer(account).slice(7)}`);

    expect(res.status).toBe(200);
  });

  it('rejects revoked tokens (token version changed)', async () => {
    const account = makeAccount();
    db.findUnique.mockResolvedValue({ ...account, tokenVersion: 1 });

    const res = await request(app).get('/api/auth/me').set('Authorization', bearer(account));

    expect(res.status).toBe(401);
  });

  it('rejects deleted accounts', async () => {
    const account = makeAccount();
    db.findUnique.mockResolvedValue({ ...account, isDeleted: true });

    const res = await request(app).get('/api/auth/me').set('Authorization', bearer(account));

    expect(res.status).toBe(401);
  });
});

describe('PUT /api/auth/change-password', () => {
  it('changes the password, revokes other sessions and issues a new token', async () => {
    const account = makeAccount();
    db.findUnique.mockResolvedValue(account);
    db.update.mockResolvedValue({ ...account, tokenVersion: 1 });

    const res = await request(app)
      .put('/api/auth/change-password')
      .set('Authorization', bearer(account))
      .send({ oldPassword: PASSWORD, newPassword: 'another-strong-password' });

    expect(res.status).toBe(200);
    const { data } = db.update.mock.calls[0]![0];
    expect(data.tokenVersion).toEqual({ increment: 1 });
    expect(await bcrypt.compare('another-strong-password', data.password)).toBe(true);
    const payload = jwtHelpers.verifyToken(res.body.data.accessToken, configs.jwt.access_token);
    expect(payload.tv).toBe(1);
  });

  it('rejects a wrong old password', async () => {
    const account = makeAccount();
    db.findUnique.mockResolvedValue(account);

    const res = await request(app)
      .put('/api/auth/change-password')
      .set('Authorization', bearer(account))
      .send({ oldPassword: 'not-my-password', newPassword: 'another-strong-password' });

    expect(res.status).toBe(401);
    expect(db.update).not.toHaveBeenCalled();
  });
});

describe('PUT /api/auth/resend-otp', () => {
  it('answers the same for unknown emails, without sending anything', async () => {
    db.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .put('/api/auth/resend-otp')
      .send({ email: 'nobody@example.com' });

    expect(res.status).toBe(200);
    expect(enqueueEmail).not.toHaveBeenCalled();
  });

  it('sends a new OTP to unverified accounts', async () => {
    db.findUnique.mockResolvedValue({ id: 'acc-1', isAccountVerified: false });
    db.updateMany.mockResolvedValue({ count: 1 });

    const res = await request(app)
      .put('/api/auth/resend-otp')
      .send({ email: 'resend@example.com' });

    expect(res.status).toBe(200);
    expect(enqueueEmail).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'verify-account', email: 'resend@example.com' }),
    );
  });

  it('enforces the resend cooldown', async () => {
    db.findUnique.mockResolvedValue({ id: 'acc-1', isAccountVerified: false });
    db.updateMany.mockResolvedValue({ count: 0 }); // sent less than a minute ago

    const res = await request(app).put('/api/auth/resend-otp').send({ email: 'cool@example.com' });

    expect(res.status).toBe(429);
    expect(enqueueEmail).not.toHaveBeenCalled();
  });
});

describe('PUT /api/auth/forget-password', () => {
  it('answers the same for unknown emails, without sending anything', async () => {
    db.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .put('/api/auth/forget-password')
      .send({ email: 'nobody@example.com' });

    expect(res.status).toBe(200);
    expect(enqueueEmail).not.toHaveBeenCalled();
  });

  it('emails a reset link bound to the current token version', async () => {
    db.findUnique.mockResolvedValue({ id: 'acc-1', isDeleted: false, tokenVersion: 3 });

    const res = await request(app)
      .put('/api/auth/forget-password')
      .send({ email: 'forgot@example.com' });

    expect(res.status).toBe(200);
    const job = vi.mocked(enqueueEmail).mock.calls[0]![0];
    if (job.type !== 'reset-password') throw new Error('unexpected job');
    const token = decodeURIComponent(new URL(job.resetLink).searchParams.get('token')!);
    expect(jwtHelpers.verifyToken(token, configs.jwt.reset_secret)).toMatchObject({
      purpose: 'reset-password',
      accountId: 'acc-1',
      tv: 3,
    });
  });
});

describe('PUT /api/auth/reset-password', () => {
  const resetToken = (tv = 0) =>
    jwtHelpers.generateToken(
      { purpose: 'reset-password', accountId: 'acc-1', tv },
      configs.jwt.reset_secret,
      '15m',
    );

  it('sets the new password, verifies the account and revokes sessions', async () => {
    db.updateMany.mockResolvedValue({ count: 1 });

    const res = await request(app)
      .put('/api/auth/reset-password')
      .send({ token: resetToken(2), newPass: 'brand-new-password' });

    expect(res.status).toBe(200);
    const { where, data } = db.updateMany.mock.calls[0]![0];
    expect(where).toEqual({ id: 'acc-1', isDeleted: false, tokenVersion: 2 });
    expect(data).toMatchObject({ tokenVersion: { increment: 1 }, isAccountVerified: true });
    expect(await bcrypt.compare('brand-new-password', data.password)).toBe(true);
  });

  it('rejects a link that was already used', async () => {
    db.updateMany.mockResolvedValue({ count: 0 }); // token version moved on

    const res = await request(app)
      .put('/api/auth/reset-password')
      .send({ token: resetToken(), newPass: 'brand-new-password' });

    expect(res.status).toBe(401);
  });

  it('rejects a forged token', async () => {
    const res = await request(app)
      .put('/api/auth/reset-password')
      .send({ token: 'not.a.jwt', newPass: 'brand-new-password' });

    expect(res.status).toBe(401);
    expect(db.updateMany).not.toHaveBeenCalled();
  });
});

describe('sign out', () => {
  it('POST /sign-out clears the cookie', async () => {
    const res = await request(app).post('/api/auth/sign-out');

    expect(res.status).toBe(200);
    expect(accessCookie(res)).toMatch(/access_token=;.*Expires=Thu, 01 Jan 1970/);
  });

  it('POST /sign-out-all revokes every token of the account', async () => {
    const account = makeAccount();
    db.findUnique.mockResolvedValue(account);
    db.update.mockResolvedValue(account);

    const res = await request(app)
      .post('/api/auth/sign-out-all')
      .set('Authorization', bearer(account));

    expect(res.status).toBe(200);
    expect(db.update).toHaveBeenCalledWith({
      where: { id: 'acc-1' },
      data: { tokenVersion: { increment: 1 } },
    });
  });
});

describe('POST /api/auth/social/exchange', () => {
  const codes = prismaMock.socialLoginCode;
  const account = {
    id: 'acc-1',
    email: 'user@example.com',
    role: 'USER',
    tokenVersion: 0,
    isDeleted: false,
  };

  it('trades a valid code for an access token, deleting the code', async () => {
    codes.delete.mockResolvedValue({ expiresAt: new Date(Date.now() + 30_000), account });

    const res = await request(app).post('/api/auth/social/exchange').send({ code: 'the-code' });

    expect(res.status).toBe(200);
    expect(codes.delete.mock.calls[0]![0].where).toEqual({ codeHash: hashLoginCode('the-code') });
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(accessCookie(res)).toBeDefined();
  });

  it('rejects unknown or already used codes', async () => {
    codes.delete.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('not found', {
        code: 'P2025',
        clientVersion: 'test',
      }),
    );

    const res = await request(app).post('/api/auth/social/exchange').send({ code: 'used' });

    expect(res.status).toBe(401);
  });

  it('rejects expired codes', async () => {
    codes.delete.mockResolvedValue({ expiresAt: new Date(Date.now() - 1), account });

    const res = await request(app).post('/api/auth/social/exchange').send({ code: 'old' });

    expect(res.status).toBe(401);
  });
});

describe('refresh tokens', () => {
  const tokens = prismaMock.refreshToken;
  const account = {
    id: 'acc-1',
    email: 'user@example.com',
    role: 'USER',
    tokenVersion: 0,
    isDeleted: false,
  };
  const storedRow = (overrides = {}) => ({
    tokenHash: 'hash',
    accountId: 'acc-1',
    familyId: 'family-1',
    tokenVersion: 0,
    expiresAt: new Date(Date.now() + 60_000),
    usedAt: null,
    account,
    ...overrides,
  });

  /** The `refresh_token` cookie from a response, if one was set. */
  const refreshCookie = (res: request.Response) =>
    ([] as string[])
      .concat(res.headers['set-cookie'] ?? [])
      .find((c) => c.startsWith('refresh_token='));

  const refresh = (token: string) =>
    request(app).post('/api/auth/refresh-token').set('Cookie', `refresh_token=${token}`);

  it('sign-in starts a session: refresh token in an httpOnly cookie, stored hashed', async () => {
    db.findUnique.mockResolvedValue(makeAccount());

    const res = await request(app)
      .post('/api/auth/sign-in')
      .send({ email: 'user@example.com', password: PASSWORD });

    const { refreshToken } = res.body.data;
    expect(refreshToken).toEqual(expect.any(String));
    expect(refreshCookie(res)).toMatch(/HttpOnly/);
    expect(refreshCookie(res)).toMatch(/Path=\/api\/auth/);
    const { data } = tokens.create.mock.calls[0]![0];
    expect(data).toMatchObject({ tokenHash: hashRefreshToken(refreshToken), accountId: 'acc-1' });
    expect(data.tokenHash).not.toBe(refreshToken);
  });

  it('rotates the token, keeping the session (family)', async () => {
    tokens.findUnique.mockResolvedValue(storedRow());
    tokens.updateMany.mockResolvedValue({ count: 1 });

    const res = await refresh('old-token');

    expect(res.status).toBe(200);
    expect(tokens.findUnique.mock.calls[0]![0].where).toEqual({
      tokenHash: hashRefreshToken('old-token'),
    });
    // the old token is used up, a new one is issued in the same family
    expect(tokens.updateMany.mock.calls[0]![0]).toMatchObject({
      where: { tokenHash: hashRefreshToken('old-token'), usedAt: null },
    });
    expect(tokens.create.mock.calls[0]![0].data.familyId).toBe('family-1');
    expect(res.body.data.refreshToken).not.toBe('old-token');
    expect(refreshCookie(res)).toContain(res.body.data.refreshToken);
    expect(accessCookie(res)).toBeDefined();
  });

  it('accepts the refresh token in the body (non-browser clients)', async () => {
    tokens.findUnique.mockResolvedValue(storedRow());
    tokens.updateMany.mockResolvedValue({ count: 1 });

    const res = await request(app)
      .post('/api/auth/refresh-token')
      .send({ refreshToken: 'body-token' });

    expect(res.status).toBe(200);
    expect(tokens.findUnique.mock.calls[0]![0].where.tokenHash).toBe(
      hashRefreshToken('body-token'),
    );
  });

  it('ends the whole session when a rotated token is reused (theft)', async () => {
    tokens.findUnique.mockResolvedValue(storedRow({ usedAt: new Date(Date.now() - 60_000) }));

    const res = await refresh('stolen');

    expect(res.status).toBe(401);
    expect(tokens.deleteMany).toHaveBeenCalledWith({ where: { familyId: 'family-1' } });
    expect(tokens.create).not.toHaveBeenCalled();
  });

  it('does not end the session for a parallel refresh within the grace window', async () => {
    tokens.findUnique.mockResolvedValue(storedRow({ usedAt: new Date() }));

    const res = await refresh('just-rotated');

    expect(res.status).toBe(401);
    expect(tokens.deleteMany).not.toHaveBeenCalled();
  });

  it('only one of two parallel refreshes wins', async () => {
    tokens.findUnique.mockResolvedValue(storedRow());
    tokens.updateMany.mockResolvedValue({ count: 0 }); // the other request used it first

    const res = await refresh('raced');

    expect(res.status).toBe(401);
    expect(tokens.create).not.toHaveBeenCalled();
  });

  it.each([
    ['expired', storedRow({ expiresAt: new Date(Date.now() - 1) })],
    ['issued before a password change', storedRow({ account: { ...account, tokenVersion: 1 } })],
    ['for a deleted account', storedRow({ account: { ...account, isDeleted: true } })],
  ])('rejects a token that is %s', async (_case, row) => {
    tokens.findUnique.mockResolvedValue(row);

    const res = await refresh('stale');

    expect(res.status).toBe(401);
    expect(tokens.deleteMany).toHaveBeenCalledWith({ where: { familyId: 'family-1' } });
  });

  it('rejects unknown or missing tokens', async () => {
    tokens.findUnique.mockResolvedValue(null);

    expect((await refresh('made-up')).status).toBe(401);
    expect((await request(app).post('/api/auth/refresh-token')).status).toBe(401);
  });

  it('sign-out ends this session and clears both cookies', async () => {
    tokens.findUnique.mockResolvedValue({ familyId: 'family-1' });

    const res = await request(app).post('/api/auth/sign-out').set('Cookie', 'refresh_token=mine');

    expect(res.status).toBe(200);
    expect(tokens.deleteMany).toHaveBeenCalledWith({ where: { familyId: 'family-1' } });
    expect(refreshCookie(res)).toMatch(/refresh_token=;.*Expires=Thu, 01 Jan 1970/);
  });

  it.each([
    ['sign-out-all', '/api/auth/sign-out-all', 'post', {}],
    [
      'a password change',
      '/api/auth/change-password',
      'put',
      { oldPassword: PASSWORD, newPassword: 'another-strong-password' },
    ],
  ] as const)('%s revokes every refresh token of the account', async (_case, url, method, body) => {
    const acc = makeAccount();
    db.findUnique.mockResolvedValue(acc);
    db.update.mockResolvedValue(acc);

    const res = await request(app)[method](url).set('Authorization', bearer(acc)).send(body);

    expect(res.status).toBe(200);
    expect(tokens.deleteMany).toHaveBeenCalledWith({ where: { accountId: 'acc-1' } });
  });
});
