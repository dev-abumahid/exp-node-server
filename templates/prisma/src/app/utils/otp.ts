import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { configs } from '../configs/index.js';

export const OTP_EXPIRY_MS = 5 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000;

/** A cryptographically random 6-digit code. */
export const generateOtp = (): string => randomInt(0, 1_000_000).toString().padStart(6, '0');

/** OTPs are stored as an HMAC, never in plain text. */
export const hashOtp = (otp: string): string =>
  createHmac('sha256', configs.jwt.verified_token).update(otp).digest('hex');

export const isOtpMatch = (otp: string, storedHash: string | null): boolean => {
  if (!storedHash) return false;
  const a = Buffer.from(hashOtp(otp), 'hex');
  const b = Buffer.from(storedHash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
};
