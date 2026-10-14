import { PgBoss } from 'pg-boss';
import { configs } from '../configs/index.js';
import { logger } from '../lib/logger.js';

export type BossOptions = {
  connectionString?: string;
  /** Postgres schema for the job tables (default `pgboss`). */
  schema?: string;
};

/**
 * pg-boss stores jobs in its own schema in the app's Postgres database, so no
 * Redis is needed. Created on start, see startQueues().
 */
let boss: PgBoss | undefined;

/** A new pg-boss instance (a producer and/or worker). */
export const newBoss = ({ connectionString = configs.db_url, schema }: BossOptions = {}) => {
  const instance = new PgBoss({ connectionString, ...(schema && { schema }) });
  instance.on('error', (error) => logger.error(error, 'pg-boss error'));
  return instance;
};

/** Creates the app's pg-boss instance, used by `enqueueEmail()` & co. */
export const createBoss = (options?: BossOptions) => {
  boss = newBoss(options);
  return boss;
};

export const getBoss = (): PgBoss => {
  if (!boss) throw new Error('Queues are not started, call startQueues() first');
  return boss;
};
