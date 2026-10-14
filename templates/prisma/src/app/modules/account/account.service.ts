import { Prisma } from '@prisma/client';
import bcrypt from 'bcrypt';
import type { Request } from 'express';
import { randomUUID } from 'node:crypto';
import { configs } from '../../configs/index.js';
import { prisma } from '../../lib/prisma.js';
import { hashLoginCode } from '../../passport-js/social-account.js';
import { enqueueEmail } from '../../queues/email.queue.js';
import { AppError } from '../../utils/app_error.js';
import { jwtHelpers, type TokenUser } from '../../utils/JWT.js';
import { hashRefreshToken, readRefreshToken } from '../../utils/session.js';
import {
  generateOtp,
  hashOtp,
  isOtpMatch,
  OTP_EXPIRY_MS,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_MS,
} from '../../utils/otp.js';

// cheap hashes under tests, the real cost everywhere else
const BCRYPT_ROUNDS = configs.is_test ? 4 : 12;

// a rotated refresh token that comes back within this window is most likely a
// parallel refresh (two tabs at once), not theft, so it doesn't end the session
const REFRESH_REUSE_GRACE_MS = 30 * 1000;

// a valid hash to compare against when the account doesn't exist, so login takes
// the same time either way (prevents finding registered emails by timing)
const DUMMY_HASH = bcrypt.hashSync('dummy-password', BCRYPT_ROUNDS);

type VerifyTokenPayload = { purpose: 'verify-account'; accountId: string };
// `tv` is the account's token version; any password change makes the link stale
type ResetTokenPayload = { purpose: 'reset-password'; accountId: string; tv: number };

const toTokenUser = (account: {
  id: string;
  email: string;
  role: TokenUser['role'];
  tokenVersion: number;
}): TokenUser => ({
  accountId: account.id,
  email: account.email,
  role: account.role,
  tokenVersion: account.tokenVersion,
});

/** A fresh OTP + verification link, and the columns to store for it. */
const newVerification = (accountId: string) => {
  const otp = generateOtp();
  const token = jwtHelpers.generateToken(
    { purpose: 'verify-account', accountId } satisfies VerifyTokenPayload,
    configs.jwt.verified_token,
    '5m',
  );
  return {
    otp,
    verificationLink: `${configs.jwt.front_end_url}/verify?token=${encodeURIComponent(token)}`,
    data: { lastOtp: hashOtp(otp), lastOtpSendingTime: new Date(), otpAttempts: 0 },
  };
};

const create_account_into_db = async (req: Request) => {
  const payload: { email: string; password: string; fullName: string } = req.body;

  const exists = await prisma.account.findUnique({
    where: { email: payload.email },
    select: { id: true },
  });
  if (exists) {
    throw new AppError('An account with this email already exists', 409);
  }

  // id generated up front so the account and its OTP are written in one query
  const id = randomUUID();
  const { otp, verificationLink, data } = newVerification(id);

  const account = await prisma.account.create({
    data: {
      id,
      email: payload.email,
      password: await bcrypt.hash(payload.password, BCRYPT_ROUNDS),
      ...data,
      profile: { create: { fullName: payload.fullName } },
    },
    select: { id: true, email: true, role: true, isAccountVerified: true, profile: true },
  });

  await enqueueEmail({ type: 'verify-account', email: account.email, otp, verificationLink });
  return account;
};

const verify_account_using_otp_into_db = async (req: Request) => {
  const payload: { email: string; otp: string } = req.body;
  const invalid = new AppError('Invalid or expired OTP', 401);

  const account = await prisma.account.findUnique({ where: { email: payload.email } });
  if (!account || account.isAccountVerified || !account.lastOtp) {
    throw invalid;
  }

  const isExpired =
    !account.lastOtpSendingTime ||
    Date.now() - account.lastOtpSendingTime.getTime() > OTP_EXPIRY_MS;
  if (isExpired) {
    throw invalid;
  }

  // use up an attempt atomically, so parallel guesses can't go past the limit
  const attempt = await prisma.account.updateMany({
    where: { id: account.id, otpAttempts: { lt: OTP_MAX_ATTEMPTS } },
    data: { otpAttempts: { increment: 1 } },
  });
  if (!attempt.count) {
    throw new AppError('Too many wrong attempts, please request a new OTP', 429);
  }

  if (!isOtpMatch(payload.otp, account.lastOtp)) {
    throw invalid;
  }

  // only succeeds if this OTP wasn't replaced or used in the meantime
  const verified = await prisma.account.updateMany({
    where: { id: account.id, lastOtp: account.lastOtp },
    data: { isAccountVerified: true, lastOtp: null, otpAttempts: 0 },
  });
  if (!verified.count) {
    throw invalid;
  }
  return null;
};

const verify_account_using_link_into_db = async (req: Request) => {
  const decoded = jwtHelpers.verifyToken<VerifyTokenPayload>(
    req.body.token,
    configs.jwt.verified_token,
  );
  if (decoded.purpose !== 'verify-account') {
    throw new AppError('Invalid token', 401);
  }

  const result = await prisma.account.updateMany({
    where: { id: decoded.accountId, isDeleted: false },
    data: { isAccountVerified: true, lastOtp: null, otpAttempts: 0 },
  });
  if (!result.count) {
    throw new AppError('Invalid token', 401);
  }
  return null;
};

const login_user_into_db = async (req: Request): Promise<TokenUser> => {
  const payload: { email: string; password: string } = req.body;
  const invalid = new AppError('Invalid email or password', 401);

  const account = await prisma.account.findUnique({ where: { email: payload.email } });

  // always run bcrypt, and never skip the password check: social-login accounts
  // have no password and must sign in through their provider
  const isPasswordMatch = await bcrypt.compare(payload.password, account?.password ?? DUMMY_HASH);
  if (!account || !account.password || !isPasswordMatch) {
    throw invalid;
  }

  if (account.isDeleted) {
    throw new AppError('Account is deleted', 401);
  }
  if (!account.isAccountVerified) {
    throw new AppError('Account is not verified', 401);
  }

  return toTokenUser(account);
};

const get_user_account_from_db = async (req: Request) => {
  return prisma.account.findUnique({
    where: { id: req.user!.accountId },
    select: {
      id: true,
      email: true,
      role: true,
      provider: true,
      isAccountVerified: true,
      isDeleted: true,
      profile: true,
      socialAccounts: { select: { provider: true, createdAt: true } },
    },
  });
};

/** Changes the password and revokes every other session. Returns the user for a new token. */
const change_password_into_db = async (req: Request): Promise<TokenUser> => {
  const payload: { oldPassword: string; newPassword: string } = req.body;

  if (payload.oldPassword === payload.newPassword) {
    throw new AppError('New password must be different from the old password', 400);
  }

  const account = await prisma.account.findUnique({ where: { id: req.user!.accountId } });
  if (!account) {
    throw new AppError('Account not found', 404);
  }
  if (!account.password) {
    throw new AppError('This account uses social login and has no password', 400);
  }

  const isPasswordMatch = await bcrypt.compare(payload.oldPassword, account.password);
  if (!isPasswordMatch) {
    throw new AppError('Incorrect password', 401);
  }

  const updated = await prisma.account.update({
    where: { id: account.id },
    data: {
      password: await bcrypt.hash(payload.newPassword, BCRYPT_ROUNDS),
      tokenVersion: { increment: 1 },
    },
  });
  await prisma.refreshToken.deleteMany({ where: { accountId: account.id } });
  return toTokenUser(updated);
};

const resend_otp_and_verification_link_from_db = async (req: Request) => {
  const email: string = req.body.email;
  const account = await prisma.account.findUnique({
    where: { email },
    select: { id: true, isAccountVerified: true },
  });

  // same response whether or not the account exists (no email enumeration)
  if (!account || account.isAccountVerified) return null;

  const { otp, verificationLink, data } = newVerification(account.id);

  // the cooldown check is part of the update, so parallel requests send one email
  const result = await prisma.account.updateMany({
    where: {
      id: account.id,
      isAccountVerified: false,
      OR: [
        { lastOtpSendingTime: null },
        { lastOtpSendingTime: { lt: new Date(Date.now() - OTP_RESEND_COOLDOWN_MS) } },
      ],
    },
    data,
  });
  if (!result.count) {
    throw new AppError('Please wait a minute before requesting a new OTP', 429);
  }

  await enqueueEmail({ type: 'verify-account', email, otp, verificationLink });
  return null;
};

const forget_password_generate_reset_token_from_db = async (req: Request) => {
  const email: string = req.body.email;
  const account = await prisma.account.findUnique({
    where: { email },
    select: { id: true, isDeleted: true, tokenVersion: true },
  });

  // same response whether or not the account exists (no email enumeration)
  if (!account || account.isDeleted) return null;

  const resetToken = jwtHelpers.generateToken(
    {
      purpose: 'reset-password',
      accountId: account.id,
      tv: account.tokenVersion,
    } satisfies ResetTokenPayload,
    configs.jwt.reset_secret,
    configs.jwt.reset_expires,
  );
  const resetLink = `${configs.jwt.front_end_url}/reset-password?token=${encodeURIComponent(resetToken)}`;

  await enqueueEmail({ type: 'reset-password', email, resetLink });
  return null;
};

const reset_password_using_token_into_db = async (req: Request) => {
  const { token, newPass }: { token: string; newPass: string } = req.body;
  const invalid = new AppError('Invalid or expired reset link', 401);

  const decoded = jwtHelpers.verifyToken<ResetTokenPayload>(token, configs.jwt.reset_secret);
  if (decoded.purpose !== 'reset-password' || typeof decoded.tv !== 'number') {
    throw invalid;
  }

  // Matching on the token version makes the link single-use (the update bumps it)
  // and also signs out every existing session. Following the emailed link proves
  // ownership of the address, so the account counts as verified from now on.
  const result = await prisma.account.updateMany({
    where: { id: decoded.accountId, isDeleted: false, tokenVersion: decoded.tv },
    data: {
      password: await bcrypt.hash(newPass, BCRYPT_ROUNDS),
      tokenVersion: { increment: 1 },
      isAccountVerified: true,
      lastOtp: null,
      otpAttempts: 0,
    },
  });
  if (!result.count) {
    throw invalid;
  }
  await prisma.refreshToken.deleteMany({ where: { accountId: decoded.accountId } });
  return null;
};

/** Revokes every access and refresh token issued for the account. */
const sign_out_everywhere_from_db = async (req: Request) => {
  const accountId = req.user!.accountId;
  await prisma.account.update({
    where: { id: accountId },
    data: { tokenVersion: { increment: 1 } },
  });
  await prisma.refreshToken.deleteMany({ where: { accountId } });
  return null;
};

/** Ends the session the refresh token belongs to (this device only). */
const sign_out_from_db = async (req: Request) => {
  const token = readRefreshToken(req);
  if (!token) return null;
  const row = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashRefreshToken(token) },
    select: { familyId: true },
  });
  if (row) await prisma.refreshToken.deleteMany({ where: { familyId: row.familyId } });
  return null;
};

/**
 * Validates and uses up a refresh token. Returns the user and the session it
 * belongs to, so the controller can issue the next token of that session.
 */
const refresh_session_from_db = async (
  req: Request,
): Promise<{ user: TokenUser; familyId: string }> => {
  const invalid = new AppError('Invalid or expired refresh token', 401);
  const token = readRefreshToken(req);
  if (!token) throw invalid;

  const tokenHash = hashRefreshToken(token);
  const row = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: {
      account: {
        select: { id: true, email: true, role: true, tokenVersion: true, isDeleted: true },
      },
    },
  });
  if (!row) throw invalid;

  const endSession = () => prisma.refreshToken.deleteMany({ where: { familyId: row.familyId } });

  if (row.usedAt) {
    // An already rotated token came back. Outside the grace window that means two
    // parties hold this session (the token was stolen), so end the whole session.
    if (Date.now() - row.usedAt.getTime() > REFRESH_REUSE_GRACE_MS) await endSession();
    throw invalid;
  }

  const isStale =
    row.expiresAt.getTime() < Date.now() ||
    row.account.isDeleted ||
    row.account.tokenVersion !== row.tokenVersion; // password changed / signed out everywhere
  if (isStale) {
    await endSession();
    throw invalid;
  }

  // mark it used atomically, so of two parallel refreshes only one gets a new token
  const used = await prisma.refreshToken.updateMany({
    where: { tokenHash, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (!used.count) throw invalid;

  return { user: toTokenUser(row.account), familyId: row.familyId };
};

/** Trades the single-use code from a social login redirect for the user to sign in. */
const exchange_social_login_code_from_db = async (req: Request): Promise<TokenUser> => {
  const invalid = new AppError('Invalid or expired login code', 401);

  // deleting is what makes the code single-use, even under concurrent requests
  const row = await prisma.socialLoginCode
    .delete({
      where: { codeHash: hashLoginCode(req.body.code) },
      select: {
        expiresAt: true,
        account: {
          select: { id: true, email: true, role: true, tokenVersion: true, isDeleted: true },
        },
      },
    })
    .catch((err) => {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') return null;
      throw err;
    });

  if (!row || row.expiresAt.getTime() < Date.now() || row.account.isDeleted) {
    throw invalid;
  }
  return toTokenUser(row.account);
};

export const account_services = {
  create_account_into_db,
  login_user_into_db,
  get_user_account_from_db,
  change_password_into_db,
  verify_account_using_otp_into_db,
  resend_otp_and_verification_link_from_db,
  verify_account_using_link_into_db,
  forget_password_generate_reset_token_from_db,
  reset_password_using_token_into_db,
  sign_out_everywhere_from_db,
  sign_out_from_db,
  refresh_session_from_db,
  exchange_social_login_code_from_db,
};
