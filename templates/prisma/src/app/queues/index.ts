import { logger } from '../lib/logger.js';
import { type BossOptions, createBoss, getBoss } from './boss.js';
import { createEmailQueue, type EmailJobOptions, startEmailWorker } from './email.queue.js';
import { startMaintenance } from './maintenance.queue.js';

/** The defaults are meant for production; tests pass shorter delays. */
export type QueueOptions = BossOptions &
  EmailJobOptions & {
    /** Schedule the cleanup of expired rows (default true). */
    maintenance?: boolean;
  };

export const startQueues = async (options: QueueOptions = {}) => {
  const boss = createBoss(options);
  await boss.start();
  await createEmailQueue(boss, options);
  await startEmailWorker(boss, options);
  if (options.maintenance !== false) await startMaintenance(boss);
  logger.info('Queues are running...');
};

// waits for running jobs to finish (up to 30s) instead of abandoning them
export const stopQueues = () => getBoss().stop({ graceful: true, timeout: 30_000 });
