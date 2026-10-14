import { logger } from '../lib/logger.js';
import { createAgenda, getAgenda } from './agenda.js';
import { defineEmailJob } from './email.queue.js';

export const startQueues = async () => {
  createAgenda();
  defineEmailJob();
  await getAgenda().start();
  logger.info('Queues are running...');
};

// waits for running jobs to finish (up to 30s) instead of abandoning them
export const stopQueues = () => getAgenda().drain(30_000);
