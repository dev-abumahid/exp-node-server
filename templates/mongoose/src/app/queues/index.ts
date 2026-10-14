import { logger } from '../lib/logger.js';
import { type AgendaOptions, createAgenda, getAgenda } from './agenda.js';
import { defineEmailJob, type EmailJobOptions, ensureEmailJobCleanup } from './email.queue.js';

/** The defaults are meant for production; tests pass shorter delays. */
export type QueueOptions = AgendaOptions & EmailJobOptions;

export const startQueues = async (options: QueueOptions = {}) => {
  const agenda = createAgenda(options);
  defineEmailJob(agenda, options);
  await ensureEmailJobCleanup();
  await agenda.start();
  logger.info('Queues are running...');
};

// waits for running jobs to finish (up to 30s) instead of abandoning them
export const stopQueues = () => getAgenda().drain(30_000);
