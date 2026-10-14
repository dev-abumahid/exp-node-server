import bcrypt from 'bcrypt';
import { configs } from '../../src/app/configs/index.js';
import type { T_account } from '../../src/app/modules/account/account.interface.js';
import { account_model } from '../../src/app/modules/account/account.schema.js';
import { profile_model } from '../../src/app/modules/profile/profile.schema.js';
import { jwtHelpers } from '../../src/app/utils/JWT.js';

export const PASSWORD = 'correct-horse-battery';
const passwordHash = bcrypt.hashSync(PASSWORD, 4);

/** Inserts a verified, active account with a password, plus its profile. */
export const createAccount = async (overrides: Partial<T_account> = {}) => {
  const account = await account_model.create({
    email: 'user@example.com',
    password: passwordHash,
    isAccountVerified: true,
    ...overrides,
  });
  await profile_model.create({ accountId: account._id, fullName: 'Test User' });
  return account;
};

/** The account as stored, including the fields that are hidden by default. */
export const findAccount = (email = 'user@example.com') =>
  account_model.findOne({ email }).select('+password +lastOtp').lean();

type TokenSubject = Pick<T_account, 'email' | 'role' | 'tokenVersion'> & { _id: unknown };

/** A signed access token, as the app would issue it for `account`. */
export const accessTokenFor = (account: TokenSubject) =>
  jwtHelpers.generateToken(
    {
      accountId: String(account._id),
      email: account.email,
      role: account.role,
      tv: account.tokenVersion,
    },
    configs.jwt.access_token,
    '1h',
  );

export const bearer = (account: TokenSubject) => `Bearer ${accessTokenFor(account)}`;
