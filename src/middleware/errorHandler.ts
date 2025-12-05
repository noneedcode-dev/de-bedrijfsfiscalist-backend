// src/middleware/errorHandler.ts
import {
  Request,
  Response,
  NextFunction,
  RequestHandler,
} from 'express';
import { sendError } from '../utils/sendError';
import { logger } from '../config/logger';

export class AppError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

/**
 * Async route handler'ları try/catch yazmadan sarmak için helper
 */
export const asyncHandler = (handler: RequestHandler): RequestHandler => {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
};

/**
 * 404 için fallback
 */
export function notFoundHandler(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404));
}

/**
 * Global error handler
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction
): void {
  if (res.headersSent) {
    return next(err);
  }

  const isAppError = err instanceof AppError;
  const statusCode = isAppError ? err.statusCode : 500;
  const message = isAppError ? err.message : 'Internal server error';

  logger.error('❌ Error handler:', {
    message: (err as any)?.message ?? err,
    stack: (err as any)?.stack,
    statusCode,
  });

  sendError(res, message, statusCode);
}

