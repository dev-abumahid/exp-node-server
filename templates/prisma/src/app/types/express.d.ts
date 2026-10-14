import type { AuthUser } from '../utils/JWT.js';

declare global {
  namespace Express {
    // `req.user` is set by the auth middleware (from the JWT) and by passport (social login)
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface User extends AuthUser {}
  }
}

export {};
