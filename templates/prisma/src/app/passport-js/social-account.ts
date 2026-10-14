import type { PROVIDER } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import type { Profile } from 'passport';
import { prisma } from '../lib/prisma.js';
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

const userSelect = { id: true, email: true, role: true, isDeleted: true, tokenVersion: true };

const toUser = (account: {
  id: string;
  email: string;
  role: TokenUser['role'];
  isDeleted: boolean;
  tokenVersion: number;
}): TokenUser => {
  if (account.isDeleted) {
    throw new SocialLoginError('account_disabled', 'Account is deleted');
  }
  return {
    accountId: account.id,
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

  const linked = await prisma.socialAccount.findUnique({
    where: { provider_providerUserId: { provider, providerUserId } },
    select: { account: { select: userSelect } },
  });
  if (linked) return toUser(linked.account);

  const email = pickEmail(profile, provider);
  if (!email) {
    throw new SocialLoginError(
      'email_unverified',
      `Your ${provider.toLowerCase()} account doesn't have a verified email address.`,
    );
  }

  const link = { create: { provider, providerUserId } };
  const existing = await prisma.account.findUnique({
    where: { email },
    select: { ...userSelect, isAccountVerified: true },
  });

  if (!existing) {
    const account = await prisma.account.create({
      data: {
        email,
        password: null,
        provider,
        isAccountVerified: true,
        profile: {
          create: {
            fullName: profile.displayName || email.split('@')[0]!,
            profilePhoto: profile.photos?.[0]?.value ?? null,
          },
        },
        socialAccounts: link,
      },
      select: userSelect,
    });
    return toUser(account);
  }

  toUser(existing); // rejects deleted accounts before linking anything

  const account = await prisma.account.update({
    where: { id: existing.id },
    data: {
      socialAccounts: link,
      // The provider just proved ownership of this email, but nobody ever proved the
      // password on this unverified account belongs to the owner (it may have been
      // registered by someone else). Verify the account and drop that password.
      ...(!existing.isAccountVerified && {
        isAccountVerified: true,
        password: null,
        lastOtp: null,
        otpAttempts: 0,
      }),
    },
    select: userSelect,
  });
  return toUser(account);
};

export const hashLoginCode = (code: string) => createHash('sha256').update(code).digest('hex');

/** Creates the single-use code the front-end exchanges for an access token. */
export const createSocialLoginCode = async (accountId: string): Promise<string> => {
  const code = randomBytes(32).toString('base64url');
  await prisma.socialLoginCode.create({
    data: {
      codeHash: hashLoginCode(code),
      accountId,
      expiresAt: new Date(Date.now() + SOCIAL_LOGIN_CODE_TTL_MS),
    },
  });
  return code;
};
