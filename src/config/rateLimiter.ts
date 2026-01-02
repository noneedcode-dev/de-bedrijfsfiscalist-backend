// src/config/rateLimiter.ts
import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { ErrorCodes } from '../constants/errorCodes';
import { env } from './env';

const standardHeaders = true;
const legacyHeaders = false;

// In development, use relaxed rate limits
const isDevelopment = env.nodeEnv === 'development';

/**
 * Rate limiting for health check endpoints
 * 1 dakikada IP başına max 60 request (dev: 300)
 */
export const healthLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 dakika
  max: isDevelopment ? 300 : 60, // IP başına max request
  handler: (req: Request, res: Response) => {
    const requestId = req.id || 'unknown';
    res.setHeader('X-Request-ID', requestId);
    res.status(429).json({
      code: ErrorCodes.RATE_LIMIT_EXCEEDED,
      message: 'Health check rate limit exceeded',
      request_id: requestId,
      timestamp: new Date().toISOString(),
    });
  },
  standardHeaders,
  legacyHeaders,
  skip: isDevelopment ? () => false : undefined, // Don't skip in dev, just increase limit
});

/**
 * Rate limiting for API routes
 * 15 dakikada IP başına max 100 request (dev: 1000)
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 dakika
  max: isDevelopment ? 1000 : 100, // IP başına max request
  handler: (req: Request, res: Response) => {
    const requestId = req.id || 'unknown';
    res.setHeader('X-Request-ID', requestId);
    res.status(429).json({
      code: ErrorCodes.RATE_LIMIT_EXCEEDED,
      message: 'API rate limit exceeded, please try again later',
      request_id: requestId,
      timestamp: new Date().toISOString(),
    });
  },
  standardHeaders,
  legacyHeaders,
  skip: isDevelopment ? () => false : undefined,
});

/**
 * Daha sıkı rate limit (auth endpoints için)
 * 15 dakikada IP başına max 20 request (dev: 100)
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDevelopment ? 100 : 20,
  handler: (req: Request, res: Response) => {
    const requestId = req.id || 'unknown';
    res.setHeader('X-Request-ID', requestId);
    res.status(429).json({
      code: ErrorCodes.RATE_LIMIT_AUTH_EXCEEDED,
      message: 'Authentication rate limit exceeded',
      request_id: requestId,
      timestamp: new Date().toISOString(),
    });
  },
  standardHeaders,
  legacyHeaders,
  skip: isDevelopment ? () => false : undefined,
});

/**
 * Very strict rate limit for invitation endpoints (abuse prevention)
 * 1 saatte IP başına max 10 request (dev: 50)
 */
export const invitationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: isDevelopment ? 50 : 10,
  handler: (req: Request, res: Response) => {
    const requestId = req.id || 'unknown';
    res.setHeader('X-Request-ID', requestId);
    res.status(429).json({
      code: ErrorCodes.RATE_LIMIT_INVITE_EXCEEDED,
      message: 'Invitation rate limit exceeded. Please try again later.',
      request_id: requestId,
      timestamp: new Date().toISOString(),
    });
  },
  standardHeaders,
  legacyHeaders,
  skip: isDevelopment ? () => false : undefined,
});

