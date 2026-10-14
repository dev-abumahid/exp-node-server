import z from 'zod';

const email = z.email('A valid email is required.').transform((e) => e.toLowerCase());
const password = z
  .string('Password is required.')
  .min(8, 'Password must be at least 8 characters.')
  .max(72, 'Password must be at most 72 characters.'); // bcrypt ignores bytes past 72

const sign_up = z.object({
  email,
  password,
  fullName: z.string('Full name is required.').trim().min(1).max(100),
});

const sign_in = z.object({
  email,
  password: z.string('Password is required.').max(72),
});

const change_password = z.object({
  oldPassword: z.string('Old Password is required').max(72),
  newPassword: password,
});

const verify_otp = z.object({
  email,
  otp: z.string('OTP is required').regex(/^\d{6}$/, 'OTP must be 6 digits'),
});

const token = z.string('Token is required').min(1).max(2048);

const verify_link = z.object({
  token,
});

const email_only = z.object({
  email,
});

const reset_pass = z.object({
  token,
  newPass: password,
});

// optional: browsers send the refresh token as a cookie instead
const refresh_token = z.object({ refreshToken: z.string().min(1).max(256).optional() }).optional();

const social_exchange = z.object({
  code: z.string('Code is required').min(1).max(256),
});

export const account_validation = {
  sign_up,
  sign_in,
  change_password,
  verify_otp,
  resend_otp: email_only,
  forget_password: email_only,
  verify_link,
  reset_pass,
  social_exchange,
  refresh_token,
};
