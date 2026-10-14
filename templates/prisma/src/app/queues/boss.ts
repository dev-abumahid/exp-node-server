import { PgBoss } from 'pg-boss';
import { configs } from '../configs/index.js';
import { logger } from '../lib/logger.js';

// pg-boss stores jobs in its own `pgboss` schema in the app's Postgres database
export const boss = new PgBoss({ connectionString: configs.db_url });

boss.on('error', (error) => logger.error(error, 'pg-boss error'));
