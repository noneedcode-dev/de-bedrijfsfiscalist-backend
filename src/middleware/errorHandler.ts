// src/middleware/errorHandler.ts
import {
  Request,
  Response,
  NextFunction,
  RequestHandler,
} from 'express';
import { ZodError } from 'zod';
import { logger } from '../config/logger';
import { ErrorCode, ErrorMessages, ErrorCodes } from '../constants/errorCodes';

export class AppError extends Error {
  statusCode: number;
  code?: ErrorCode;
  details?: any;

  constructor(message: string, statusCode = 500, code?: ErrorCode, details?: any) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace?.(this, this.constructor);
  }

  /**
   * Create AppError from error code
   * Uses default English message from ErrorMessages
   */
  static fromCode(code: ErrorCode, statusCode = 500, details?: any): AppError {
    return new AppError(ErrorMessages[code], statusCode, code, details);
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
 * Standard error response interface
 */
export interface StandardErrorResponse {
  code: string;
  message: string;
  details?: any;
  request_id: string;
  timestamp: string;
}

/**
 * Global error handler
 * Returns standardized error response: { code, message, details?, request_id, timestamp }
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (res.headersSent) {
    return next(err);
  }

  const requestId = req.id || 'unknown';
  const timestamp = new Date().toISOString();

  let statusCode = 500;
  let code: string = ErrorCodes.INTERNAL_ERROR;
  let message = 'Internal server error';
  let details: any = undefined;

  // Handle AppError
  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
    code = err.code || ErrorCodes.INTERNAL_ERROR;
    details = err.details;
  }
  // Handle Zod validation errors
  else if (err instanceof ZodError) {
    statusCode = 422;
    code = ErrorCodes.VALIDATION_FAILED;
    message = 'Validation failed';
    details = err.issues.map((issue: any) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
  }
  // Handle Supabase errors (PostgrestError)
  else if (err && typeof err === 'object' && 'code' in err && 'message' in err) {
    const supabaseError = err as any;
    const pgCode = supabaseError.code;
    
    // Map Postgres error codes to appropriate HTTP statuses
    if (pgCode === '23505') {
      // unique_violation
      statusCode = 409;
      code = ErrorCodes.CONFLICT;
      message = 'Duplicate entry - resource already exists';
    } else if (pgCode === '23503') {
      // foreign_key_violation
      statusCode = 409;
      code = ErrorCodes.CONFLICT;
      message = 'Foreign key constraint violation';
    } else if (pgCode === '23502') {
      // not_null_violation
      statusCode = 422;
      code = ErrorCodes.VALIDATION_FAILED;
      message = 'Required field is missing';
    } else if (pgCode === '23514') {
      // check_violation
      statusCode = 422;
      code = ErrorCodes.VALIDATION_FAILED;
      message = 'Check constraint violation';
    } else if (pgCode === '22P02') {
      // invalid_text_representation
      statusCode = 422;
      code = ErrorCodes.VALIDATION_FAILED;
      message = 'Invalid data format';
    } else if (pgCode === '42501') {
      // insufficient_privilege
      statusCode = 403;
      code = ErrorCodes.FORBIDDEN;
      message = 'Insufficient privileges';
    } else if (pgCode === 'PGRST116') {
      // PostgREST: no rows returned
      statusCode = 404;
      code = ErrorCodes.NOT_FOUND;
      message = 'Resource not found';
    } else {
      // Default for unknown database errors
      statusCode = 500;
      code = ErrorCodes.INTERNAL_ERROR;
      message = supabaseError.message || 'Database error';
    }
    
    details = {
      supabase_code: pgCode,
      hint: supabaseError.hint,
      details: supabaseError.details,
    };
  }
  // Handle generic errors
  else if (err instanceof Error) {
    message = err.message;
  }

  logger.error('❌ Error handler:', {
    message,
    code,
    statusCode,
    request_id: requestId,
    stack: (err as any)?.stack,
    details,
  });

  // Ensure X-Request-ID header is set
  if (!res.getHeader('X-Request-ID')) {
    res.setHeader('X-Request-ID', requestId);
  }

  // Standard error response
  const errorResponse: StandardErrorResponse = {
    code,
    message,
    request_id: requestId,
    timestamp,
  };

  if (details !== undefined) {
    errorResponse.details = details;
  }

  res.status(statusCode).json(errorResponse);
}

