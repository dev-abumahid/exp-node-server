import type { ErrorRequestHandler } from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import { ZodError } from 'zod';
import { configs } from '../configs/index.js';
import handleZodError from '../errors/zodError.js';
import { logger } from '../lib/logger.js';
import type { TErrorSources } from '../types/error.js';
import { AppError } from '../utils/app_error.js';

const globalErrorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  let statusCode = 500;
  let message = 'Something went wrong!';
  let errorSources: TErrorSources = [];

  if (err instanceof ZodError) {
    ({ statusCode, message, errorSources } = handleZodError(err));
  } else if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
  } else if (err instanceof multer.MulterError) {
    statusCode = 400;
    message = err.message;
  } else if (err?.code === 11000) {
    // duplicate key; the offending value is not echoed back
    statusCode = 409;
    message = 'Resource already exists';
  } else if (err instanceof mongoose.Error.CastError) {
    statusCode = 400;
    message = `Invalid ${err.path}`;
  } else if (err instanceof mongoose.Error.ValidationError) {
    statusCode = 400;
    message = 'Validation Error';
    errorSources = Object.values(err.errors).map((e) => ({ path: e.path, message: e.message }));
  } else if (err?.status === 401 || err?.name === 'AuthenticationError') {
    // passport authentication failures
    statusCode = 401;
    message = 'Authentication failed';
  } else if (err instanceof SyntaxError && 'body' in err) {
    // malformed JSON body
    statusCode = 400;
    message = 'Invalid JSON body';
  } else if (err?.expose && typeof err.status === 'number' && err.status < 500) {
    // client errors from body-parser & co (body too large, unsupported charset, ...)
    statusCode = err.status;
    message = err.message;
  }

  if (statusCode >= 500) {
    logger.error({ err, method: req.method, url: req.originalUrl }, 'Unhandled error');
    // don't leak internals (SQL, file paths, ...) to clients in production
    if (!configs.is_production && err instanceof Error) message = err.message;
  }

  res.status(statusCode).json({
    success: false,
    message,
    errorSources: errorSources.length ? errorSources : [{ path: '', message }],
    ...(configs.is_production ? {} : { stack: err?.stack }),
  });
};

export default globalErrorHandler;
