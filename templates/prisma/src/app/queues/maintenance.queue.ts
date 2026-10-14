import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import type { PgBoss } from 'pg-boss';

export const MAINTENANCE_QUEUE = 'maintenance';

/** Deletes expired rate limit counters, social login codes and refresh tokens. */
const cleanup = async () => {
  const now = new Date();
  const [rateLimits, loginCodes, refreshTokens] = await Promise.all([
    prisma.rateLimit.deleteMany({ where: { resetAt: { lt: now } } }),
    prisma.socialLoginCode.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: now } } }),
  ]);
  logger.debug(
    {
      rateLimits: rateLimits.count,
      loginCodes: loginCodes.count,
      refreshTokens: refreshTokens.count,
    },
    'Removed expired rows',
  );
};

export const startMaintenance = async (boss: PgBoss) => {
  await boss.createQueue(MAINTENANCE_QUEUE, { retryLimit: 1, deleteAfterSeconds: 60 * 60 });
  // pg-boss runs a schedule once across all instances, every 15 minutes
  await boss.schedule(MAINTENANCE_QUEUE, '*/15 * * * *');
  await boss.work(MAINTENANCE_QUEUE, cleanup);
};
