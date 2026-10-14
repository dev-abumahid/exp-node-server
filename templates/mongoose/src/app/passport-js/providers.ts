import type { PROVIDER } from '../modules/account/account.interface.js';
import type { Profile, Strategy } from 'passport';
import { Strategy as FacebookStrategy } from 'passport-facebook';
import { Strategy as GithubStrategy } from 'passport-github';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import OAuth1Strategy, { InternalOAuthError as OAuth1Error } from 'passport-oauth1';
import OAuth2Strategy, { InternalOAuthError } from 'passport-oauth2';
import { configs } from '../configs/index.js';
import { CookieRequestTokenStore, CookieStateStore } from './oauth-state.js';
import { findOrCreateSocialAccount } from './social-account.js';

type Done = (err: unknown, user?: Express.User | false) => void;

export type SocialProviderName =
  'google' | 'facebook' | 'github' | 'twitter' | 'linkedin' | 'discord';

export interface SocialProvider {
  /** Passport strategy name, also used in the route: `/api/auth/social/<name>`. */
  name: SocialProviderName;
  /** Human readable name, e.g. for login buttons. */
  label: string;
  provider: PROVIDER;
  enabled: boolean;
  createStrategy: () => Strategy;
}

/** Shared verify callback: map the provider profile to one of our accounts. */
const verify =
  (provider: PROVIDER) =>
  (_token: string, _tokenSecret: string, profile: Profile, done: Done): void => {
    findOrCreateSocialAccount(profile, provider).then(
      (user) => done(null, user),
      (err) => done(err),
    );
  };

/**
 * Minimal OAuth 2.0 strategy for providers without a maintained passport package:
 * fetches `profileURL` with the access token and maps the JSON to a passport profile.
 */
class JsonProfileStrategy extends OAuth2Strategy {
  constructor(
    name: string,
    options: OAuth2Strategy.StrategyOptions,
    private readonly profileURL: string,
    private readonly toProfile: (json: Record<string, unknown>) => Profile,
  ) {
    super(options, verify(name.toUpperCase() as PROVIDER));
    this.name = name;
    this._oauth2.useAuthorizationHeaderforGET(true);
  }

  override userProfile(accessToken: string, done: (err?: unknown, profile?: Profile) => void) {
    this._oauth2.get(this.profileURL, accessToken, (err, body) => {
      if (err) return done(new InternalOAuthError('Failed to fetch user profile', err));
      try {
        done(null, this.toProfile(JSON.parse(String(body))));
      } catch (e) {
        done(e);
      }
    });
  }
}

/**
 * X (Twitter) login over OAuth 1.0a, which is what returns the user's email. Built on
 * passport-oauth1 directly: the old passport-twitter package is unmaintained and
 * pulls in a vulnerable XML parser.
 */
class TwitterStrategy extends OAuth1Strategy {
  constructor(options: { consumerKey: string; consumerSecret: string; callbackURL: string }) {
    super(
      {
        ...options,
        requestTokenURL: 'https://api.twitter.com/oauth/request_token',
        accessTokenURL: 'https://api.twitter.com/oauth/access_token',
        userAuthorizationURL: 'https://api.twitter.com/oauth/authenticate',
        // the request token lives in an encrypted cookie instead of a session
        requestTokenStore: new CookieRequestTokenStore('twitter'),
      },
      verify('TWITTER'),
    );
    this.name = 'twitter';
  }

  override userProfile(
    token: string,
    tokenSecret: string,
    _params: unknown,
    done: (err?: unknown, profile?: Profile) => void,
  ) {
    const url =
      'https://api.twitter.com/1.1/account/verify_credentials.json?include_email=true&skip_status=true';
    this._oauth.get(url, token, tokenSecret, (err, body) => {
      if (err) return done(new OAuth1Error('Failed to fetch user profile', err));
      try {
        const json = JSON.parse(String(body));
        done(null, {
          provider: 'twitter',
          id: String(json.id_str),
          displayName: str(json.name) ?? str(json.screen_name) ?? '',
          // X only returns the email when it is verified
          emails: json.email ? [{ value: String(json.email) }] : [],
          photos: str(json.profile_image_url_https)
            ? [{ value: json.profile_image_url_https }]
            : [],
        });
      } catch (e) {
        done(e);
      }
    });
  }
}

/**
 * `state` (login CSRF protection) and optional PKCE, kept in an encrypted cookie.
 * Typed as `object` because the strategy typings don't all declare these options.
 */
const oauthState = (name: SocialProviderName, pkce = false): object => ({
  store: new CookieStateStore(name),
  state: true,
  ...(pkce && { pkce: true }),
});

const str = (value: unknown) => (typeof value === 'string' && value ? value : undefined);

const { google, facebook, github, twitter, linkedin, discord } = configs.social;

// every OAuth 2.0 provider gets `state`; PKCE is enabled where the provider supports it
export const socialProviders: SocialProvider[] = [
  {
    name: 'google',
    label: 'Google',
    provider: 'GOOGLE',
    enabled: google.enabled,
    createStrategy: () =>
      new GoogleStrategy(
        {
          clientID: google.client_id,
          clientSecret: google.client_secret,
          callbackURL: google.callback_url,
          scope: ['openid', 'email', 'profile'],
          ...oauthState('google', true),
        },
        verify('GOOGLE'),
      ),
  },
  {
    name: 'facebook',
    label: 'Facebook',
    provider: 'FACEBOOK',
    enabled: facebook.enabled,
    createStrategy: () =>
      new FacebookStrategy(
        {
          clientID: facebook.client_id,
          clientSecret: facebook.client_secret,
          callbackURL: facebook.callback_url,
          scope: ['email', 'public_profile'],
          profileFields: ['id', 'displayName', 'emails', 'photos'],
          ...oauthState('facebook'),
        },
        verify('FACEBOOK'),
      ),
  },
  {
    name: 'github',
    label: 'GitHub',
    provider: 'GITHUB',
    enabled: github.enabled,
    createStrategy: () =>
      new GithubStrategy(
        {
          clientID: github.client_id,
          clientSecret: github.client_secret,
          callbackURL: github.callback_url,
          scope: ['user:email'],
          ...oauthState('github'),
        },
        verify('GITHUB'),
      ),
  },
  {
    name: 'twitter',
    label: 'X (Twitter)',
    provider: 'TWITTER',
    enabled: twitter.enabled,
    createStrategy: () =>
      new TwitterStrategy({
        consumerKey: twitter.client_id,
        consumerSecret: twitter.client_secret,
        callbackURL: twitter.callback_url,
      }),
  },
  {
    // "Sign In with LinkedIn using OpenID Connect"
    name: 'linkedin',
    label: 'LinkedIn',
    provider: 'LINKEDIN',
    enabled: linkedin.enabled,
    createStrategy: () =>
      new JsonProfileStrategy(
        'linkedin',
        {
          authorizationURL: 'https://www.linkedin.com/oauth/v2/authorization',
          tokenURL: 'https://www.linkedin.com/oauth/v2/accessToken',
          clientID: linkedin.client_id,
          clientSecret: linkedin.client_secret,
          callbackURL: linkedin.callback_url,
          scope: ['openid', 'profile', 'email'],
          ...oauthState('linkedin'),
        },
        'https://api.linkedin.com/v2/userinfo',
        (json) => ({
          provider: 'linkedin',
          id: String(json.sub),
          displayName: str(json.name) ?? '',
          emails: json.email
            ? [{ value: String(json.email), verified: json.email_verified === true } as never]
            : [],
          photos: str(json.picture) ? [{ value: String(json.picture) }] : [],
        }),
      ),
  },
  {
    name: 'discord',
    label: 'Discord',
    provider: 'DISCORD',
    enabled: discord.enabled,
    createStrategy: () =>
      new JsonProfileStrategy(
        'discord',
        {
          authorizationURL: 'https://discord.com/oauth2/authorize',
          tokenURL: 'https://discord.com/api/oauth2/token',
          clientID: discord.client_id,
          clientSecret: discord.client_secret,
          callbackURL: discord.callback_url,
          scope: ['identify', 'email'],
          ...oauthState('discord'),
        },
        'https://discord.com/api/users/@me',
        (json) => ({
          provider: 'discord',
          id: String(json.id),
          displayName: str(json.global_name) ?? str(json.username) ?? '',
          emails: json.email
            ? [{ value: String(json.email), verified: json.verified === true } as never]
            : [],
          photos: str(json.avatar)
            ? [{ value: `https://cdn.discordapp.com/avatars/${json.id}/${json.avatar}.png` }]
            : [],
        }),
      ),
  },
];

export const enabledSocialProviders = socialProviders.filter((p) => p.enabled);
