import mongoose from 'mongoose';
import { configs } from '../configs/index.js';
import { logger } from './logger.js';

// reject unknown fields in queries instead of silently ignoring them
mongoose.set('strictQuery', true);

export const connectDatabase = async () => {
  await mongoose.connect(configs.db_url, {
    // fail fast on startup instead of buffering queries forever
    serverSelectionTimeoutMS: 10_000,
    // autoIndex stays on: the unique email and TTL indexes are needed for correctness
  });
  mongoose.connection.on('error', (err) => logger.error(err, 'MongoDB error'));
  logger.info('Connected to MongoDB');
};

export const disconnectDatabase = () => mongoose.disconnect();
