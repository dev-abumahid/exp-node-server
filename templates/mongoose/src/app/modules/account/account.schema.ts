import { model, Schema, type Types } from 'mongoose';
import { profile_model } from '../profile/profile.schema.js';
import {
  PROVIDERS,
  ROLES,
  type T_account,
  type T_refresh_token,
  type T_social_account,
  type T_social_login_code,
} from './account.interface.js';

const accountSchema = new Schema<T_account>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // never loaded unless asked for with `.select('+password')`
    password: { type: String, default: null, select: false },
    provider: { type: String, enum: PROVIDERS, default: 'LOCAL' },
    role: { type: String, enum: ROLES, default: 'USER' },
    isDeleted: { type: Boolean, default: false },
    isAccountVerified: { type: Boolean, default: false },
    tokenVersion: { type: Number, default: 0 },
    lastOtp: { type: String, default: null, select: false },
    lastOtpSendingTime: { type: Date, default: null },
    otpAttempts: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      // belt and braces: secrets never leave the server, even if selected
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret.password;
        delete ret.lastOtp;
        return ret;
      },
    },
  },
);

export const account_model = model('account', accountSchema);

const socialAccountSchema = new Schema<T_social_account>(
  {
    accountId: { type: Schema.Types.ObjectId, ref: 'account', required: true, index: true },
    provider: { type: String, enum: PROVIDERS, required: true },
    providerUserId: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);
socialAccountSchema.index({ provider: 1, providerUserId: 1 }, { unique: true });

export const social_account_model = model('social_account', socialAccountSchema);

const socialLoginCodeSchema = new Schema<T_social_login_code>(
  {
    _id: { type: String, required: true },
    accountId: { type: Schema.Types.ObjectId, ref: 'account', required: true },
    // TTL index: MongoDB deletes expired codes by itself
    expiresAt: { type: Date, required: true, expires: 0 },
  },
  { versionKey: false },
);

export const social_login_code_model = model('social_login_code', socialLoginCodeSchema);

const refreshTokenSchema = new Schema<T_refresh_token>(
  {
    _id: { type: String, required: true },
    accountId: { type: Schema.Types.ObjectId, ref: 'account', required: true, index: true },
    familyId: { type: String, required: true, index: true },
    tokenVersion: { type: Number, required: true },
    // TTL index: MongoDB deletes expired tokens by itself
    expiresAt: { type: Date, required: true, expires: 0 },
    usedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

export const refresh_token_model = model('refresh_token', refreshTokenSchema);

/**
 * Creates an account and its profile. Without a transaction (they need a replica
 * set), the account is removed again if the profile can't be created.
 */
export const createAccountWithProfile = async (
  account: Partial<T_account> & { _id?: Types.ObjectId },
  profile: { fullName: string; profilePhoto?: string | null },
) => {
  const created = await account_model.create(account);
  try {
    await profile_model.create({ accountId: created._id, ...profile });
  } catch (err) {
    await account_model.deleteOne({ _id: created._id });
    throw err;
  }
  return created;
};
