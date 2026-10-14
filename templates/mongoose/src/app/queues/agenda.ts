import { MongoBackend } from '@agendajs/mongo-backend';
import { Agenda } from 'agenda';
import mongoose from 'mongoose';
import { logger } from '../lib/logger.js';

/**
 * Agenda stores jobs in the app's MongoDB (`agendaJobs` collection), so no Redis
 * is needed. Created on start, once mongoose is connected, to reuse its connection.
 */
let agenda: Agenda | undefined;

export const createAgenda = () => {
  agenda = new Agenda({
    backend: new MongoBackend({ mongo: mongoose.connection.db! }),
    processEvery: '5 seconds',
  });
  agenda.on('error', (err) => logger.error(err, 'Agenda error'));
  return agenda;
};

export const getAgenda = (): Agenda => {
  if (!agenda) throw new Error('Queues are not started, call startQueues() first');
  return agenda;
};
