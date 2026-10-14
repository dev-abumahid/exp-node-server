import 'dotenv/config';
import { z } from 'zod';

const bool = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');

// JWT/session secrets must be long and random, e.g. `openssl rand -hex 32`
const secret = z.string().min(32, 'must be at least 32 characters');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  DATABASE_URL: z.url(),

  // auth
  ACCESS_TOKEN: secret,
  // short-lived; clients get a new one from POST /api/auth/refresh-token
  ACCESS_EXPIRES: z.string().default('15m'),
  REFRESH_EXPIRES_DAYS: z.coerce.number().int().positive().default(30),
  VERIFIED_TOKEN: secret,
  RESET_SECRET: secret,
  RESET_EXPIRES: z.string().default('15m'),
  FRONT_END_URL: z.url(),
  CORS_ORIGINS: z.string().optional(),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),

  // email
  APP_USER_EMAIL: z.string().optional(),
  APP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().optional(),

  // cloudinary
  CLOUD_NAME: z.string().optional(),
  CLOUD_API_KEY: z.string().optional(),
  CLOUD_API_SECRET: z.string().optional(),

  // swagger
  ENABLE_SWAGGER: z.enum(['true', 'false']).optional(),
  DEVELOPMENT_BASE_URL: z.string().default('http://localhost:5000'),
  PRODUCTION_BASE_URL: z.string().default(''),

  // social login
  // where the browser is sent after a social login, with `?code=` or `?error=`
  SOCIAL_REDIRECT_URL: z.url().optional(),

  IS_GOOGLE_LOGIN: bool,
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CALLBACK_URL: z.string().optional(),

  IS_FACEBOOK_LOGIN: bool,
  FACEBOOK_APP_ID: z.string().optional(),
  FACEBOOK_APP_SECRET: z.string().optional(),
  FACEBOOK_CALLBACK_URL: z.string().optional(),

  IS_GITHUB_LOGIN: bool,
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  GITHUB_CALLBACK_URL: z.string().optional(),

  IS_TWITTER_LOGIN: bool,
  TWITTER_CONSUMER_KEY: z.string().optional(),
  TWITTER_CONSUMER_SECRET: z.string().optional(),
  TWITTER_CALLBACK_URL: z.string().optional(),

  IS_LINKEDIN_LOGIN: bool,
  LINKEDIN_CLIENT_ID: z.string().optional(),
  LINKEDIN_CLIENT_SECRET: z.string().optional(),
  LINKEDIN_CALLBACK_URL: z.string().optional(),

  IS_DISCORD_LOGIN: bool,
  DISCORD_CLIENT_ID: z.string().optional(),
  DISCORD_CLIENT_SECRET: z.string().optional(),
  DISCORD_CALLBACK_URL: z.string().optional(),
});

type Env = z.infer<typeof envSchema>;

// logger depends on configs, so failures here are reported with console
const fail = (message: string): never => {
  // eslint-disable-next-line no-console
  console.error(message);
  process.exit(1);
};

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
  fail(`Invalid environment variables:\n${issues.join('\n')}`);
}
const env = parsed.data as Env;

/** Credentials for a social provider; all are required once the provider is enabled. */
const provider = (enabled: boolean, keys: [keyof Env, keyof Env, keyof Env]) => {
  const [clientId, clientSecret, callbackUrl] = keys.map((key) => {
    const value = env[key];
    if (enabled && (typeof value !== 'string' || !value)) {
      fail(`${key} is required when its login provider is enabled`);
    }
    return typeof value === 'string' ? value : '';
  }) as [string, string, string];

  return { enabled, client_id: clientId, client_secret: clientSecret, callback_url: callbackUrl };
};

export const configs = {
  port: env.PORT,
  env: env.NODE_ENV,
  is_production: env.NODE_ENV === 'production',
  is_test: env.NODE_ENV === 'test',
  db_url: env.DATABASE_URL,
  cors_origins: (env.CORS_ORIGINS ?? env.FRONT_END_URL).split(',').map((o) => o.trim()),
  trust_proxy: env.TRUST_PROXY,
  enable_swagger: env.ENABLE_SWAGGER
    ? env.ENABLE_SWAGGER === 'true'
    : env.NODE_ENV !== 'production',
  jwt: {
    access_token: env.ACCESS_TOKEN,
    access_expires: env.ACCESS_EXPIRES,
    refresh_expires_days: env.REFRESH_EXPIRES_DAYS,
    reset_secret: env.RESET_SECRET,
    reset_expires: env.RESET_EXPIRES,
    verified_token: env.VERIFIED_TOKEN,
    front_end_url: env.FRONT_END_URL,
  },
  email: {
    app_email: env.APP_USER_EMAIL,
    app_password: env.APP_PASSWORD,
    from: env.MAIL_FROM ?? env.APP_USER_EMAIL,
  },
  cloudinary: {
    cloud_name: env.CLOUD_NAME,
    cloud_api_key: env.CLOUD_API_KEY,
    cloud_api_secret: env.CLOUD_API_SECRET,
  },
  swagger_config: {
    development_base_url: env.DEVELOPMENT_BASE_URL,
    production_base_url: env.PRODUCTION_BASE_URL,
  },
  social: {
    redirect_url: env.SOCIAL_REDIRECT_URL ?? `${env.FRONT_END_URL}/auth/social/callback`,
    google: provider(env.IS_GOOGLE_LOGIN, [
      'GOOGLE_CLIENT_ID',
      'GOOGLE_CLIENT_SECRET',
      'GOOGLE_CALLBACK_URL',
    ]),
    facebook: provider(env.IS_FACEBOOK_LOGIN, [
      'FACEBOOK_APP_ID',
      'FACEBOOK_APP_SECRET',
      'FACEBOOK_CALLBACK_URL',
    ]),
    github: provider(env.IS_GITHUB_LOGIN, [
      'GITHUB_CLIENT_ID',
      'GITHUB_CLIENT_SECRET',
      'GITHUB_CALLBACK_URL',
    ]),
    twitter: provider(env.IS_TWITTER_LOGIN, [
      'TWITTER_CONSUMER_KEY',
      'TWITTER_CONSUMER_SECRET',
      'TWITTER_CALLBACK_URL',
    ]),
    linkedin: provider(env.IS_LINKEDIN_LOGIN, [
      'LINKEDIN_CLIENT_ID',
      'LINKEDIN_CLIENT_SECRET',
      'LINKEDIN_CALLBACK_URL',
    ]),
    discord: provider(env.IS_DISCORD_LOGIN, [
      'DISCORD_CLIENT_ID',
      'DISCORD_CLIENT_SECRET',
      'DISCORD_CALLBACK_URL',
    ]),
  },
};
