// src/modules/auth/auth.middleware.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthUser } from '../../types/express';
import { AppError } from '../../middleware/errorHandler';
import { ErrorCodes } from '../../constants/errorCodes';
import { logger } from '../../config/logger';
import { env } from '../../config/env';
import { createSupabaseAdminClient, createSupabaseUserClient } from '../../lib/supabaseClient';

/**
 * Authentication middleware
 * Verifies Supabase token from Authorization header and attaches user data from app_users table
 */
export async function authenticateJWT(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    logger.warn('Authentication failed: missing authorization header', { ip: req.ip });
    return next(AppError.fromCode(ErrorCodes.AUTH_MISSING_HEADER, 401));
  }

  const parts = authHeader.split(' ');

  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    logger.warn('Authentication failed: invalid header format', { ip: req.ip });
    return next(AppError.fromCode(ErrorCodes.AUTH_INVALID_FORMAT, 401));
  }

  const token = parts[1];

  // Test mode: Use local JWT verification instead of Supabase
  if (process.env.NODE_ENV === 'test') {
    try {
      const decoded = jwt.verify(token, env.supabase.jwtSecret) as any;

      // Extract claims
      const sub = decoded.sub;
      const role = decoded.role;
      const client_id = decoded.client_id;

      // Validate required claims
      if (!sub || !role) {
        logger.warn('Authentication failed: missing required claims (sub or role)', {
          ip: req.ip,
          hasSub: !!sub,
          hasRole: !!role,
        });
        return next(AppError.fromCode(ErrorCodes.AUTH_INVALID_CLAIMS, 401, {
          missing_claims: [
            !sub && 'sub',
            !role && 'role',
          ].filter(Boolean),
        }));
      }

      // For client role, client_id is required
      if (role === 'client' && !client_id) {
        logger.warn('Authentication failed: client role missing client_id', {
          ip: req.ip,
          userId: sub,
        });
        return next(AppError.fromCode(ErrorCodes.AUTH_INVALID_CLAIMS, 401, {
          missing_claims: ['client_id'],
          reason: 'client_id is required for client role',
        }));
      }

      // Set req.user
      req.user = {
        sub,
        role,
        client_id: client_id || '',
        accessToken: token,
      } as AuthUser;

      logger.debug('Authentication successful (test mode)', {
        userId: sub,
        role,
        clientId: client_id,
      });

      return next();
    } catch (error) {
      logger.warn('Authentication failed: invalid token (test mode)', { ip: req.ip, error });
      return next(AppError.fromCode(ErrorCodes.AUTH_INVALID_TOKEN, 401));
    }
  }

  // Production mode: Use Supabase verification
  try {
    // 1) Supabase token'ı doğrula
    const supabaseUser = createSupabaseUserClient(token);
    const { data: authData, error: authError } = await supabaseUser.auth.getUser();

    if (authError || !authData?.user) {
      logger.warn('Authentication failed: invalid or expired token', { ip: req.ip, error: authError?.message });
      return next(AppError.fromCode(ErrorCodes.AUTH_INVALID_TOKEN, 401));
    }

    const supabaseUserId = authData.user.id;

    // 2) app_users tablosundan role ve client_id çek
    const supabaseAdmin = createSupabaseAdminClient();
    const { data: appUser, error: userError } = await supabaseAdmin
      .from('app_users')
      .select('id, role, client_id, email')
      .eq('id', supabaseUserId)
      .maybeSingle();

    if (userError) {
      logger.error('Authentication failed: error fetching user data', { 
        ip: req.ip, 
        supabaseUserId, 
        error: userError 
      });
      return next(new AppError('Error fetching user data', 500, ErrorCodes.INTERNAL_ERROR, userError));
    }

    if (!appUser) {
      logger.warn('Authentication failed: user not found in app_users', { 
        ip: req.ip, 
        supabaseUserId 
      });
      return next(AppError.fromCode(ErrorCodes.AUTH_USER_NOT_FOUND, 404));
    }

    // 3) Validate required JWT claims
    if (!appUser.id || !appUser.role) {
      logger.warn('Authentication failed: missing required claims (sub or role)', {
        ip: req.ip,
        hasSub: !!appUser.id,
        hasRole: !!appUser.role,
      });
      return next(AppError.fromCode(ErrorCodes.AUTH_INVALID_CLAIMS, 401, {
        missing_claims: [
          !appUser.id && 'sub',
          !appUser.role && 'role',
        ].filter(Boolean),
      }));
    }

    // For client role, client_id is required
    if (appUser.role === 'client' && !appUser.client_id) {
      logger.warn('Authentication failed: client role missing client_id', {
        ip: req.ip,
        userId: appUser.id,
      });
      return next(AppError.fromCode(ErrorCodes.AUTH_INVALID_CLAIMS, 401, {
        missing_claims: ['client_id'],
        reason: 'client_id is required for client role',
      }));
    }

    // 4) req.user'a ata
    req.user = {
      sub: appUser.id,
      role: appUser.role,
      client_id: appUser.client_id || '',
      accessToken: token,
    } as AuthUser;

    logger.debug('Authentication successful', {
      userId: appUser.id,
      role: appUser.role,
      clientId: appUser.client_id,
    });

    next();
  } catch (error) {
    logger.error('Authentication failed: unexpected error', { ip: req.ip, error });
    next(AppError.fromCode(ErrorCodes.AUTH_INVALID_TOKEN, 401));
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
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      logger.warn('Role check failed: user not authenticated', { ip: req.ip });
      return next(AppError.fromCode(ErrorCodes.AUTH_MISSING_HEADER, 401));
    }

    if (!allowedRoles.includes(req.user.role)) {
      logger.warn('Role check failed: insufficient permissions', {
        ip: req.ip,
        userRole: req.user.role,
        requiredRoles: allowedRoles,
      });
      return next(AppError.fromCode(ErrorCodes.AUTH_INSUFFICIENT_PERMISSIONS, 403));
    }

    next();
  };
}

/**
 * Optional authentication middleware
 * Verifies Supabase token if present, but continues without error if absent
 * Useful for endpoints that can be both public and personalized
 */
export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
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

  // Test mode: Use local JWT verification
  if (process.env.NODE_ENV === 'test') {
    try {
      const decoded = jwt.verify(token, env.supabase.jwtSecret) as any;

      const sub = decoded.sub;
      const role = decoded.role;
      const client_id = decoded.client_id;

      // Validate claims (same as authenticateJWT but don't fail, just skip)
      if (sub && role && (role !== 'client' || client_id)) {
        req.user = {
          sub,
          role,
          client_id: client_id || '',
          accessToken: token,
        } as AuthUser;

        logger.debug('Optional auth successful (test mode)', {
          userId: sub,
          role,
          clientId: client_id,
        });
      } else {
        logger.debug('Optional auth: invalid claims, continuing without user (test mode)', {
          ip: req.ip,
          hasSub: !!sub,
          hasRole: !!role,
          hasClientId: !!client_id,
        });
      }
    } catch (error) {
      logger.debug('Optional auth: token verification failed, continuing without user (test mode)', {
        ip: req.ip,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    return next();
  }

  // Production mode: Use Supabase verification
  try {
    const supabaseUser = createSupabaseUserClient(token);
    const { data: authData, error: authError } = await supabaseUser.auth.getUser();

    if (authError || !authData?.user) {
      logger.debug('Optional auth: invalid token, continuing without user', { ip: req.ip });
      return next();
    }

    const supabaseUserId = authData.user.id;

    const supabaseAdmin = createSupabaseAdminClient();
    const { data: appUser } = await supabaseAdmin
      .from('app_users')
      .select('id, role, client_id, email')
      .eq('id', supabaseUserId)
      .maybeSingle();

    if (appUser) {
      // Validate required claims (same as authenticateJWT but don't fail, just skip)
      if (appUser.id && appUser.role && (appUser.role !== 'client' || appUser.client_id)) {
        req.user = {
          sub: appUser.id,
          role: appUser.role,
          client_id: appUser.client_id || '',
          accessToken: token,
        } as AuthUser;
      } else {
        logger.debug('Optional auth: invalid claims, continuing without user', {
          ip: req.ip,
          hasSub: !!appUser.id,
          hasRole: !!appUser.role,
          hasClientId: !!appUser.client_id,
        });
      }
    }
  } catch (error) {
    logger.debug('Optional auth: token verification failed, continuing without user', {
      ip: req.ip,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }

  next();
}
