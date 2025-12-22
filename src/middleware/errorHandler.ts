// src/middleware/errorHandler.ts
import {
  Request,
  Response,
  NextFunction,
  RequestHandler,
} from 'express';
import { logger } from '../config/logger';
import { ErrorCode, ErrorMessages } from '../constants/errorCodes';

export class AppError extends Error {
  statusCode: number;
  code?: ErrorCode;

  constructor(message: string, statusCode = 500, code?: ErrorCode) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    Error.captureStackTrace?.(this, this.constructor);
  }

  /**
   * Create AppError from error code
   * Uses default English message from ErrorMessages
   */
  static fromCode(code: ErrorCode, statusCode = 500): AppError {
    return new AppError(ErrorMessages[code], statusCode, code);
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
  const code = isAppError ? err.code : undefined;

  logger.error('❌ Error handler:', {
    message: (err as any)?.message ?? err,
    code,
    stack: (err as any)?.stack,
    statusCode,
  });

  // Include error code in response for frontend i18n
  const errorResponse: any = { error: message };
  if (code) {
    errorResponse.code = code;
  }

  res.status(statusCode).json(errorResponse);
}

