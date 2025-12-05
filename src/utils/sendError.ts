// src/utils/sendError.ts
import { Response } from 'express';

/**
 * Standardized error response structure
 */
export interface ErrorResponse {
  error: string;
  message: string;
  statusCode: number;
  timestamp: string;
}

/**
 * Helper function to send standardized error responses
 * @param res - Express Response object
 * @param message - Error message to send to client
 * @param statusCode - HTTP status code (default: 500)
 * @param error - Error category (auto-generated from status code if not provided)
 */
export function sendError(
  res: Response,
  message: string,
  statusCode: number = 500,
  error?: string
): void {
  // Auto-generate error category based on status code if not provided
  const errorCategory =
    error ||
    (statusCode === 401
      ? 'Unauthorized'
      : statusCode === 403
        ? 'Forbidden'
        : statusCode === 404
          ? 'Not Found'
          : statusCode === 429
            ? 'Too Many Requests'
            : statusCode === 400
              ? 'Bad Request'
              : 'Internal Server Error');

  const errorResponse: ErrorResponse = {
    error: errorCategory,
    message,
    statusCode,
    timestamp: new Date().toISOString(),
  };

  res.status(statusCode).json(errorResponse);
}

