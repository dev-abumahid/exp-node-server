import { createHash, randomBytes } from 'node:crypto';
import type { Types } from 'mongoose';
import type { Profile } from 'passport';
import type { PROVIDER } from '../modules/account/account.interface.js';
import {
  account_model,
  createAccountWithProfile,
  social_account_model,
  social_login_code_model,
} from '../modules/account/account.schema.js';
import type { TokenUser } from '../utils/JWT.js';

/** How long the front-end has to exchange the code from the social login redirect. */
export const SOCIAL_LOGIN_CODE_TTL_MS = 60 * 1000;

/** A failed social login. `code` is sent to the front-end as `?error=<code>`. */
export class SocialLoginError extends Error {
  constructor(
    public code: 'email_unverified' | 'account_disabled' | 'invalid_profile',
    message: string,
  ) {
    super(message);
  }
}

type ProfileEmail = { value: string; verified?: boolean | string; primary?: boolean };

const isVerified = (e: ProfileEmail) => e.verified === true || e.verified === 'true';

// Facebook and X only ever return confirmed addresses; the others say whether the
// address is verified, and unverified ones are ignored
const ONLY_RETURNS_VERIFIED_EMAILS: PROVIDER[] = ['FACEBOOK', 'TWITTER'];

/** Picks an email we can trust, preferring the primary one. */
const pickEmail = (profile: Profile, provider: PROVIDER): string | undefined => {
  const emails = (profile.emails ?? []) as ProfileEmail[];
  const trusted = ONLY_RETURNS_VERIFIED_EMAILS.includes(provider)
    ? emails
    : emails.filter(isVerified);
  return (trusted.find((e) => e.primary) ?? trusted[0])?.value?.toLowerCase();
};

const USER_FIELDS = 'email role isDeleted tokenVersion';

type AccountForToken = {
  _id: Types.ObjectId;
  email: string;
  role: TokenUser['role'];
  isDeleted: boolean;
  tokenVersion: number;
};

const toUser = (account: AccountForToken): TokenUser => {
  if (account.isDeleted) {
    throw new SocialLoginError('account_disabled', 'Account is deleted');
  }
  return {
    accountId: String(account._id),
    email: account.email,
    role: account.role,
    tokenVersion: account.tokenVersion,
  };
};

/**
 * Finds or creates the account for a social login and returns the user for `req.user`.
 *
 * 1. A provider identity that was used before logs straight into its account.
 * 2. Otherwise the provider's verified email links the identity to the account with
 *    that email, or creates a new account.
 */
export const findOrCreateSocialAccount = async (
  profile: Profile,
  provider: PROVIDER,
): Promise<TokenUser> => {
  const providerUserId = profile.id ? String(profile.id) : '';
  if (!providerUserId) {
    throw new SocialLoginError('invalid_profile', 'The provider did not return a user id');
  }

  const linked = await social_account_model.findOne({ provider, providerUserId }).lean();
  if (linked) {
    const account = await account_model.findById(linked.accountId).select(USER_FIELDS).lean();
    if (account) return toUser(account);
    // the account was removed; drop the stale link and continue as a new login
    await social_account_model.deleteOne({ _id: linked._id });
  }

  const email = pickEmail(profile, provider);
  if (!email) {
    throw new SocialLoginError(
      'email_unverified',
      `Your ${provider.toLowerCase()} account doesn't have a verified email address.`,
    );
  }

  const existing = await account_model
    .findOne({ email })
    .select(`${USER_FIELDS} isAccountVerified`)
    .lean();

  let account: AccountForToken;
  if (!existing) {
    account = await createAccountWithProfile(
      { email, password: null, provider, isAccountVerified: true },
      {
        fullName: profile.displayName || email.split('@')[0]!,
        profilePhoto: profile.photos?.[0]?.value ?? null,
      },
    );
  } else {
    toUser(existing); // rejects deleted accounts before linking anything
    account = existing;

    if (!existing.isAccountVerified) {
      // The provider just proved ownership of this email, but nobody ever proved the
      // password on this unverified account belongs to the owner (it may have been
      // registered by someone else). Verify the account and drop that password.
      await account_model.updateOne(
        { _id: existing._id },
        { $set: { isAccountVerified: true, password: null, lastOtp: null, otpAttempts: 0 } },
      );
    }
  }

  await social_account_model.create({ accountId: account._id, provider, providerUserId });
  return toUser(account);
};

export const hashLoginCode = (code: string) => createHash('sha256').update(code).digest('hex');

/** Creates the single-use code the front-end exchanges for an access token. */
export const createSocialLoginCode = async (accountId: string): Promise<string> => {
  const code = randomBytes(32).toString('base64url');
  await social_login_code_model.create({
    _id: hashLoginCode(code),
    accountId,
    expiresAt: new Date(Date.now() + SOCIAL_LOGIN_CODE_TTL_MS),
  });
  return code;
};
