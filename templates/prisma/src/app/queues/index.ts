import { logger } from '../lib/logger.js';
import { boss } from './boss.js';
import { createEmailQueue, startEmailWorker } from './email.queue.js';
import { startMaintenance } from './maintenance.queue.js';

export const startQueues = async () => {
  await boss.start();
  await createEmailQueue();
  await startEmailWorker();
  await startMaintenance();
  logger.info('Queues are running...');
};

export const stopQueues = () => boss.stop({ graceful: true });
