// src/middleware/apiKey.ts
import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import { sendError } from '../utils/sendError';

export function apiKeyMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Allowlist: /api/auth ve /api/auth/* endpoint'leri API key gerektirmez
  if (req.path === '/auth' || req.path.startsWith('/auth/')) {
    return next();
  }

  const expected = env.auth.apiKey;

  // Dev ortamında APP_API_KEY tanımlı değilse kontrolü skip edebilirsin
  if (!expected) {
    return next();
  }

  const provided = req.header('x-api-key');

  if (!provided || provided !== expected) {
    sendError(res, 'Invalid or missing API key', 401);
    return;
  }

  next();
}

