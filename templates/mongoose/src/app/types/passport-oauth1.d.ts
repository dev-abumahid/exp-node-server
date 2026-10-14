// passport-oauth1 ships no typings; this covers what providers.ts uses
declare module 'passport-oauth1' {
  import type { Profile, Strategy as PassportStrategy } from 'passport';

  type OAuthClient = {
    get(
      url: string,
      token: string,
      tokenSecret: string,
      callback: (
        err: { statusCode: number; data?: unknown } | null,
        body?: string | Buffer,
      ) => void,
    ): void;
  };

  export interface StrategyOptions {
    requestTokenURL: string;
    accessTokenURL: string;
    userAuthorizationURL: string;
    consumerKey: string;
    consumerSecret: string;
    callbackURL: string;
    requestTokenStore?: object;
  }

  export class InternalOAuthError extends Error {
    constructor(message: string, err: unknown);
  }

  export default class OAuth1Strategy extends PassportStrategy {
    constructor(
      options: StrategyOptions,
      verify: (
        token: string,
        tokenSecret: string,
        profile: Profile,
        done: (err: unknown, user?: Express.User | false) => void,
      ) => void,
    );
    name: string;
    protected _oauth: OAuthClient;
    authenticate(req: import('express').Request, options?: object): void;
    userProfile(
      token: string,
      tokenSecret: string,
      params: unknown,
      done: (err?: unknown, profile?: Profile) => void,
    ): void;
  }
}
