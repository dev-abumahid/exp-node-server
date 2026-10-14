import type { ROLE } from '@prisma/client';
import jwt, { type JwtPayload, type Secret, type SignOptions } from 'jsonwebtoken';
import { AppError } from './app_error.js';

const ALGORITHM = 'HS256';

/** The authenticated user, as stored in access tokens and on `req.user`. */
export type AuthUser = {
  accountId: string;
  email: string;
  role: ROLE;
};

/** A user plus the account's current token version, enough to sign an access token. */
export type TokenUser = AuthUser & { tokenVersion: number };

/** `tv` must match the account's `tokenVersion`, otherwise the token was revoked. */
export type JwtPayloadType = JwtPayload & AuthUser & { tv: number };

const generateToken = (payload: object, secret: Secret, expiresIn: string) =>
  jwt.sign(payload, secret, {
    algorithm: ALGORITHM,
    expiresIn: expiresIn as SignOptions['expiresIn'],
  });

/** Verifies a token, throwing a clean 401 instead of jsonwebtoken's raw errors. */
const verifyToken = <T extends object = JwtPayload>(
  token: string,
  secret: Secret,
): T & JwtPayload => {
  try {
    const decoded = jwt.verify(token, secret, { algorithms: [ALGORITHM] });
    if (typeof decoded === 'string') throw new Error('unexpected payload');
    return decoded as T & JwtPayload;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new AppError('Token expired, please try again', 401);
    }
    throw new AppError('Invalid token', 401);
  }
};

export const jwtHelpers = {
  generateToken,
  verifyToken,
};
