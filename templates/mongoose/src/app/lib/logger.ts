import pino from 'pino';
import { configs } from '../configs/index.js';

export const logger = pino({
  level: configs.is_test ? 'silent' : configs.env === 'development' ? 'debug' : 'info',
  transport:
    configs.env === 'development'
      ? {
          target: 'pino-pretty',
        }
      : undefined,
});
