// src/middleware/apiKey.ts
import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import { AppError } from './errorHandler';
import { ErrorCodes } from '../constants/errorCodes';

export function apiKeyMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  // Test bypass: Skip API key check in test mode when TEST_BYPASS_AUTH is enabled
  if (process.env.NODE_ENV === 'test' && process.env.TEST_BYPASS_AUTH !== 'false') {
    return next();
  }

  // Allowlist: /api/auth ve /api/auth/* endpoint'leri API key gerektirmez
  if (req.path === '/auth' || req.path.startsWith('/auth/')) {
    return next();
  }

  // Allowlist: /api/external-storage/callback/* OAuth callback routes don't require API key
  // because Google/Microsoft redirects cannot include custom headers
  // State JWT verification is still enforced in the callback handler
  if (req.path.startsWith('/external-storage/callback/')) {
    return next();
  }

  const expected = env.auth.apiKey;

  // Dev ortamında APP_API_KEY tanımlı değilse kontrolü skip edebilirsin
  if (!expected) {
    return next();
  }

  const provided = req.header('x-api-key');

  if (!provided) {
    return next(AppError.fromCode(ErrorCodes.AUTH_MISSING_API_KEY, 401));
  }

  if (provided !== expected) {
    return next(AppError.fromCode(ErrorCodes.AUTH_INVALID_API_KEY, 401));
  }

  next();
}

