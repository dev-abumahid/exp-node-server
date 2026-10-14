import { MongoBackend } from '@agendajs/mongo-backend';
import { Agenda } from 'agenda';
import mongoose from 'mongoose';
import { logger } from '../lib/logger.js';

export type AgendaOptions = {
  /** How often a worker looks for due jobs (ms or a human interval). */
  processEvery?: string | number;
};

/**
 * Agenda stores jobs in the app's MongoDB (`agendaJobs` collection), so no Redis
 * is needed. Created on start, once mongoose is connected, to reuse its connection.
 */
let agenda: Agenda | undefined;

/** A new Agenda instance (a worker) on the app's MongoDB connection. */
export const newAgenda = ({ processEvery = '5 seconds' }: AgendaOptions = {}) => {
  const instance = new Agenda({
    backend: new MongoBackend({ mongo: mongoose.connection.db! }),
    processEvery,
  });
  instance.on('error', (err) => logger.error(err, 'Agenda error'));
  return instance;
};

/** Creates the app's Agenda instance, used by `enqueueEmail()` & co. */
export const createAgenda = (options?: AgendaOptions) => {
  agenda = newAgenda(options);
  return agenda;
};

export const getAgenda = (): Agenda => {
  if (!agenda) throw new Error('Queues are not started, call startQueues() first');
  return agenda;
};
