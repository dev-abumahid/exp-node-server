import type { Account } from '@prisma/client';
import bcrypt from 'bcrypt';
import { configs } from '../../src/app/configs/index.js';
import { jwtHelpers } from '../../src/app/utils/JWT.js';

export const PASSWORD = 'correct-horse-battery';
const passwordHash = bcrypt.hashSync(PASSWORD, 4);

/** A verified, active account with a password. */
export const makeAccount = (overrides: Partial<Account> = {}): Account => ({
  id: 'acc-1',
  email: 'user@example.com',
  password: passwordHash,
  provider: 'LOCAL',
  role: 'USER',
  isDeleted: false,
  isAccountVerified: true,
  tokenVersion: 0,
  lastOtp: null,
  lastOtpSendingTime: null,
  otpAttempts: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

/** A signed access token, as the app would issue it for `account`. */
export const accessTokenFor = (account: Account) =>
  jwtHelpers.generateToken(
    { accountId: account.id, email: account.email, role: account.role, tv: account.tokenVersion },
    configs.jwt.access_token,
    '1h',
  );

export const bearer = (account: Account) => `Bearer ${accessTokenFor(account)}`;
