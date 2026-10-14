import { isValidObjectId } from 'mongoose';
import type { NextFunction, Request, Response } from 'express';
import { configs } from '../configs/index.js';
import type { ROLE } from '../modules/account/account.interface.js';
import { account_model } from '../modules/account/account.schema.js';
import { AppError } from '../utils/app_error.js';
import { ACCESS_TOKEN_COOKIE } from '../utils/auth_cookie.js';
import { type JwtPayloadType, jwtHelpers } from '../utils/JWT.js';

const getToken = (req: Request): string | undefined => {
  const header = req.headers.authorization;
  if (header) return header.startsWith('Bearer ') ? header.slice(7) : header;
  return req.cookies?.[ACCESS_TOKEN_COOKIE];
};

/**
 * Requires a valid access token. With roles, also requires one of them:
 * `auth()` = any signed-in user, `auth('ADMIN')` = admins only.
 */
const auth = (...roles: ROLE[]) => {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const token = getToken(req);
      if (!token) {
        throw new AppError('You are not authorized', 401);
      }

      const payload = jwtHelpers.verifyToken<JwtPayloadType>(token, configs.jwt.access_token);

      // tokens outlive account changes, so check the account is still active and
      // the token wasn't revoked (password change/reset, sign out everywhere)
      const account = isValidObjectId(payload.accountId)
        ? await account_model
            .findById(payload.accountId)
            .select('email role isDeleted tokenVersion')
            .lean()
        : null;
      if (!account || account.isDeleted || account.tokenVersion !== payload.tv) {
        throw new AppError('You are not authorized', 401);
      }

      if (roles.length && !roles.includes(account.role)) {
        throw new AppError('You do not have permission to perform this action', 403);
      }

      req.user = { accountId: String(account._id), email: account.email, role: account.role };
      next();
    } catch (err) {
      next(err);
    }
  };
};

export default auth;
