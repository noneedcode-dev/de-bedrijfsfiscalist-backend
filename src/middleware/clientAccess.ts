// src/middleware/clientAccess.ts
import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler';
import { ErrorCodes } from '../constants/errorCodes';
import { logger } from '../config/logger';

/**
 * TICKET 4: Enforce tenant isolation via validateClientAccess middleware
 * 
 * Validates that the authenticated user has access to the requested client resource.
 * - Admin role: Can access any client (cross-tenant access allowed)
 * - Client role: Can only access their own client_id (tenant isolation enforced)
 * - Missing user: Returns 401 UNAUTHORIZED
 * 
 * This middleware MUST be applied to all /api/clients/:clientId/* routes.
 * It relies solely on the :clientId path parameter and req.user from JWT middleware.
 * Query/body parameters are NOT considered for access control.
 */
export function validateClientAccess(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const urlClientId = req.params.clientId;
  const user = req.user;

  // If req.user is missing, authentication failed or was not applied
  if (!user) {
    logger.warn('Client access denied: user not authenticated', {
      ip: req.ip,
      path: req.path,
      clientId: urlClientId,
    });
    return next(AppError.fromCode(ErrorCodes.UNAUTHORIZED, 401));
  }

  // Admin role: allow access to any client
  if (user.role === 'admin') {
    logger.debug('Client access granted: admin role', {
      userId: user.sub,
      requestedClientId: urlClientId,
    });
    return next();
  }

  // Client role: enforce tenant isolation
  if (user.role === 'client') {
    if (user.client_id !== urlClientId) {
      logger.warn('Client access denied: tenant isolation violation', {
        userId: user.sub,
        userClientId: user.client_id,
        requestedClientId: urlClientId,
        ip: req.ip,
        path: req.path,
      });
      return next(AppError.fromCode(ErrorCodes.CLIENT_ACCESS_DENIED, 403));
    }

    // Client accessing their own resource - allow
    logger.debug('Client access granted: tenant match', {
      userId: user.sub,
      clientId: user.client_id,
    });
    return next();
  }

  // Unknown role - deny access (should never happen with proper auth middleware)
  logger.error('Client access denied: unknown role', {
    userId: user.sub,
    role: user.role,
    requestedClientId: urlClientId,
  });
  return next(AppError.fromCode(ErrorCodes.AUTH_INSUFFICIENT_PERMISSIONS, 403));
}

