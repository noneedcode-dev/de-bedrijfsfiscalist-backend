// src/middleware/requestLogger.ts
import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger';

export function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const startedAt = Date.now();

  // Log incoming request
  logger.info('Incoming request', {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });

  res.on('finish', () => {
    const duration = Date.now() - startedAt;
    const status = res.statusCode;

    const logData = {
      method: req.method,
      url: req.originalUrl,
      status,
      duration: `${duration}ms`,
      ip: req.ip,
    };

    // Log based on status code
    if (status >= 500) {
      logger.error('Request failed', logData);
    } else if (status >= 400) {
      logger.warn('Client error', logData);
    } else {
      logger.info('Request completed', logData);
    }
  });

  next();
}

