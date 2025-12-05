// src/modules/auth/auth.middleware.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { AuthUser } from '../../types/express';
import { AppJwtPayload } from '../../types/auth';
import { sendError } from '../../utils/sendError';
import { logger } from '../../config/logger';

/**
 * Authentication middleware
 * Verifies JWT token from Authorization header and attaches user data to request
 */
export function authenticateJWT(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    logger.warn('JWT authentication failed: missing authorization header', { ip: req.ip });
    sendError(res, 'Authorization header is missing', 401);
    return;
  }

  const parts = authHeader.split(' ');

  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    logger.warn('JWT authentication failed: invalid header format', { ip: req.ip });
    sendError(res, 'Invalid authorization header format. Expected: Bearer <token>', 401);
    return;
  }

  const token = parts[1];

  try {
    const decoded = jwt.verify(token, env.supabase.jwtSecret) as AppJwtPayload;

    const { sub, role, client_id } = decoded;

    if (!sub || !role) {
      sendError(res, 'Invalid token payload: missing required fields (sub, role)', 401);
      return;
    }

    // Client user için client_id zorunlu, admin için opsiyonel
    if (role === 'client' && !client_id) {
      sendError(res, 'Invalid token payload: client_id is required for client role', 401);
      return;
    }

    req.user = {
      sub,
      role,
      client_id,
    } as AuthUser;

    next();
  } catch (error) {
    // Sıra önemli: TokenExpiredError, JsonWebTokenError'dan extend ediyor
    if (error instanceof jwt.TokenExpiredError) {
      logger.warn('JWT authentication failed: token expired', { ip: req.ip });
      sendError(res, 'Token has expired', 401);
      return;
    }

    if (error instanceof jwt.JsonWebTokenError) {
      logger.warn('JWT authentication failed: invalid token', { ip: req.ip, error: error.message });
      sendError(res, 'Invalid token', 401);
      return;
    }

    logger.error('JWT authentication failed: verification error', { ip: req.ip, error });
    sendError(res, 'Token verification failed', 401);
  }
}

/**
 * Alias for authenticateJWT - makes intent clearer in route definitions
 */
export const requireAuth = authenticateJWT;

/**
 * Role-based access control middleware
 * Requires user to be authenticated and have one of the specified roles
 * @param allowedRoles - Array of roles that are allowed to access the route
 * @example requireRole('admin')
 * @example requireRole('admin', 'client')
 */
export function requireRole(...allowedRoles: Array<'admin' | 'client'>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      logger.warn('Role check failed: user not authenticated', { ip: req.ip });
      sendError(res, 'Authentication required', 401);
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      logger.warn('Role check failed: insufficient permissions', {
        ip: req.ip,
        userRole: req.user.role,
        requiredRoles: allowedRoles,
      });
      sendError(res, 'Insufficient permissions', 403);
      return;
    }

    next();
  };
}

/**
 * Optional authentication middleware
 * Verifies JWT token if present, but continues without error if absent
 * Useful for endpoints that can be both public and personalized
 */
export function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return next();
  }

  const parts = authHeader.split(' ');

  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    logger.debug('Optional auth: invalid header format, continuing without user', { ip: req.ip });
    return next();
  }

  const token = parts[1];

  try {
    const decoded = jwt.verify(token, env.supabase.jwtSecret) as AppJwtPayload;

    const { sub, role, client_id } = decoded;

    if (sub && role) {
      req.user = {
        sub,
        role,
        client_id,
      } as AuthUser;
    }
  } catch (error) {
    logger.debug('Optional auth: token verification failed, continuing without user', {
      ip: req.ip,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }

  next();
}
