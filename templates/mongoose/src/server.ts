import type { Server } from 'node:http';
import app from './app.js';
import { configs } from './app/configs/index.js';
import { connectDatabase, disconnectDatabase } from './app/lib/db.js';
import { logger } from './app/lib/logger.js';
import { startQueues, stopQueues } from './app/queues/index.js';

let server: Server | undefined;

async function main() {
  // connect before accepting requests, so nothing hits a database that isn't there
  await connectDatabase();
  await startQueues();

  server = app.listen(configs.port, '0.0.0.0', () => {
    logger.info(`Server is running on port ${configs.port}`);
  });
}

async function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down...`);
  // stop accepting connections and let in-flight requests finish
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  await stopQueues().catch((err) => logger.error(err, 'Error stopping queues'));
  await disconnectDatabase();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  logger.error(reason, 'Unhandled promise rejection');
});

main().catch((error) => {
  logger.error(error, 'Failed to start server');
  process.exit(1);
});
