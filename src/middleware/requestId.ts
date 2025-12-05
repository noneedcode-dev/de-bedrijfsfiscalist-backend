// src/middleware/requestId.ts
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

/**
 * Request ID middleware
 * Adds a unique ID to each request for tracking and debugging
 * - If X-Request-ID header exists, uses that
 * - Otherwise generates a new UUID
 * - Sets X-Request-ID header in response
 * - Attaches request ID to req.id for use in logging
 */
export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const requestId = (req.headers['x-request-id'] as string) || randomUUID();
  
  req.id = requestId;
  res.setHeader('X-Request-ID', requestId);
  
  next();
}

