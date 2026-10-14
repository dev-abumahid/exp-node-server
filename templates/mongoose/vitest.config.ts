import { defineConfig } from 'vitest/config';

const secret = (name: string) => `${name}-test-secret-0123456789abcdefghijklmnop`;

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // starts one in-memory MongoDB for the whole run
    globalSetup: ['./tests/global-setup.ts'],
    setupFiles: ['./tests/setup.ts'],
    // every test starts with fresh mocks
    mockReset: true,
    // the first run downloads a MongoDB binary
    hookTimeout: 120_000,
    // set before the app reads its config; values in .env don't override these
    env: {
      NODE_ENV: 'test',
      // placeholder for config validation; tests connect to the in-memory server
      DATABASE_URL: 'mongodb://localhost:27017/unused',
      ACCESS_TOKEN: secret('access'),
      VERIFIED_TOKEN: secret('verify'),
      RESET_SECRET: secret('reset'),
      FRONT_END_URL: 'http://localhost:5173',
      CORS_ORIGINS: 'http://localhost:5173',
      ENABLE_SWAGGER: 'false',
      IS_GOOGLE_LOGIN: 'true',
      GOOGLE_CLIENT_ID: 'google-client-id',
      GOOGLE_CLIENT_SECRET: 'google-client-secret',
      GOOGLE_CALLBACK_URL: 'http://localhost:5000/api/auth/social/google/callback',
      IS_GITHUB_LOGIN: 'true',
      GITHUB_CLIENT_ID: 'github-client-id',
      GITHUB_CLIENT_SECRET: 'github-client-secret',
      GITHUB_CALLBACK_URL: 'http://localhost:5000/api/auth/social/github/callback',
      IS_TWITTER_LOGIN: 'true',
      TWITTER_CONSUMER_KEY: 'twitter-key',
      TWITTER_CONSUMER_SECRET: 'twitter-secret',
      TWITTER_CALLBACK_URL: 'http://localhost:5000/api/auth/social/twitter/callback',
      IS_FACEBOOK_LOGIN: 'false',
      IS_LINKEDIN_LOGIN: 'false',
      IS_DISCORD_LOGIN: 'false',
    },
  },
});
