import type { Request } from 'express';
import rateLimit, {
  type IncrementResponse,
  ipKeyGenerator,
  type Options,
  type Store,
} from 'express-rate-limit';
import type { Collection } from 'mongodb';
import { model, Schema } from 'mongoose';

type RateLimitDoc = { _id: string; hits: number; resetAt: Date };

const rateLimitModel = model(
  'rate_limit',
  new Schema<RateLimitDoc>(
    {
      _id: { type: String, required: true },
      hits: { type: Number, required: true },
      // TTL index: MongoDB deletes counters once their window is over
      resetAt: { type: Date, required: true, expires: 0 },
    },
    { versionKey: false },
  ),
);

const isDuplicateKey = (err: unknown) => (err as { code?: number })?.code === 11000;

/**
 * Keeps hit counters in MongoDB, so limits are shared by every app instance and
 * survive restarts (no Redis needed).
 */
class MongoStore implements Store {
  windowMs = 60_000;
  // `prefix` keeps counters of different limiters apart in the same collection
  constructor(public prefix: string) {}

  init(options: Options) {
    this.windowMs = options.windowMs;
  }

  async increment(key: string): Promise<IncrementResponse> {
    // one atomic update: start a new window if the old one is over, else count the hit
    const update = [
      {
        $set: {
          hits: { $cond: [{ $gt: ['$resetAt', '$$NOW'] }, { $add: ['$hits', 1] }, 1] },
          resetAt: {
            $cond: [{ $gt: ['$resetAt', '$$NOW'] }, '$resetAt', { $add: ['$$NOW', this.windowMs] }],
          },
        },
      },
    ];
    const collection = rateLimitModel.collection as unknown as Collection<RateLimitDoc>;
    const run = () =>
      collection.findOneAndUpdate({ _id: this.prefix + key }, update, {
        upsert: true,
        returnDocument: 'after',
        includeResultMetadata: false,
      });

    // two first hits at the same moment can race on the upsert; the loser retries
    const row = await run().catch((err) => (isDuplicateKey(err) ? run() : Promise.reject(err)));
    return { totalHits: row!.hits, resetTime: row!.resetAt };
  }

  async decrement(key: string) {
    await rateLimitModel.updateOne(
      { _id: this.prefix + key, hits: { $gt: 0 } },
      { $inc: { hits: -1 } },
    );
  }

  async resetKey(key: string) {
    await rateLimitModel.deleteOne({ _id: this.prefix + key });
  }
}

const message = { success: false, message: 'Too many attempts, please try again later.' };

/** Client IP, with IPv6 addresses grouped by subnet so they can't rotate around the limit. */
const ip = (req: Request) => ipKeyGenerator(req.ip ?? '');

/** Email from the (not yet validated) body, normalised like the validators do. */
const email = (req: Request) =>
  typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';

type LimiterOptions = {
  windowMs: number;
  limit: number;
  keyGenerator?: (req: Request) => string;
};

/** A limiter backed by MongoDB. `name` must be unique. */
const createLimiter = (name: string, { windowMs, limit, keyGenerator = ip }: LimiterOptions) =>
  rateLimit({
    windowMs,
    limit,
    keyGenerator,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message,
    store: new MongoStore(`${name}:`),
  });

const MINUTE = 60 * 1000;

/**
 * Coarse limit for the whole API. Kept in memory (per instance) so normal traffic
 * doesn't pay for a database round trip; the auth limiters below are the strict ones.
 */
export const apiRateLimiter = rateLimit({
  windowMs: MINUTE,
  limit: 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message,
});

export const rateLimiters = {
  /** Account creation, per IP. */
  signUp: createLimiter('sign-up', { windowMs: 60 * MINUTE, limit: 10 }),

  /** Password guessing: per IP+email for one account, and per IP across many accounts. */
  signIn: createLimiter('sign-in', {
    windowMs: 15 * MINUTE,
    limit: 10,
    keyGenerator: (req) => `${ip(req)}:${email(req)}`,
  }),
  signInIp: createLimiter('sign-in-ip', { windowMs: 15 * MINUTE, limit: 50 }),

  /** OTP / link / reset token guessing, per IP. */
  verify: createLimiter('verify', { windowMs: 15 * MINUTE, limit: 20 }),

  /**
   * Endpoints that send an email. Limited per recipient so nobody can flood an
   * inbox from many IPs, and per IP so one client can't spray many addresses.
   */
  emailPerAddress: createLimiter('email-address', {
    windowMs: 15 * MINUTE,
    limit: 3,
    keyGenerator: email,
  }),
  emailPerIp: createLimiter('email-ip', { windowMs: 15 * MINUTE, limit: 10 }),

  /** Password changes for signed-in users, per IP. */
  changePassword: createLimiter('change-password', { windowMs: 15 * MINUTE, limit: 10 }),

  /** Token refreshes, per IP (tokens are unguessable; this only caps abuse). */
  refresh: createLimiter('refresh', { windowMs: 15 * MINUTE, limit: 300 }),

  /** Starting a social login and exchanging its code, per IP. */
  social: createLimiter('social', { windowMs: 15 * MINUTE, limit: 30 }),
};
