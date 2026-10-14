import type { Types } from 'mongoose';

export const ROLES = ['ADMIN', 'USER'] as const;
export type ROLE = (typeof ROLES)[number];

export const PROVIDERS = [
  'LOCAL',
  'GOOGLE',
  'FACEBOOK',
  'GITHUB',
  'TWITTER',
  'LINKEDIN',
  'DISCORD',
] as const;
export type PROVIDER = (typeof PROVIDERS)[number];

export type T_account = {
  email: string;
  password: string | null;
  // provider the account was created with
  provider: PROVIDER;
  role: ROLE;
  isDeleted: boolean;
  isAccountVerified: boolean;
  // bumped on password change/reset and "sign out everywhere"; access tokens
  // and reset links carrying an older version stop working
  tokenVersion: number;
  // email verification (the OTP is stored as an HMAC, never in plain text)
  lastOtp: string | null;
  lastOtpSendingTime: Date | null;
  otpAttempts: number;
  createdAt: Date;
  updatedAt: Date;
};

/** A social identity linked to an account, found by the provider's stable user id. */
export type T_social_account = {
  accountId: Types.ObjectId;
  provider: PROVIDER;
  providerUserId: string;
  createdAt: Date;
};

/** Single-use code exchanged for an access token after a social login (hash only). */
export type T_social_login_code = {
  _id: string; // sha256 of the code
  accountId: Types.ObjectId;
  expiresAt: Date;
};

/**
 * Refresh tokens are opaque random strings; only their hash is stored. Every refresh
 * rotates the token, and all tokens of one sign-in share a `familyId`, so a stolen
 * token that gets reused can revoke the whole session.
 */
export type T_refresh_token = {
  _id: string; // sha256 of the token
  accountId: Types.ObjectId;
  familyId: string;
  // the account's tokenVersion when issued; a password change makes it stale
  tokenVersion: number;
  expiresAt: Date;
  // set when the token is rotated; kept until expiry to detect reuse
  usedAt: Date | null;
};
