// src/modules/auth/auth.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { AuthUser } from '../../types/express';
import { sendError } from '../../utils/sendError';
import { logger } from '../../config/logger';
import { createSupabaseAdminClient, createSupabaseUserClient } from '../../lib/supabaseClient';

/**
 * Authentication middleware
 * Verifies Supabase token from Authorization header and attaches user data from app_users table
 */
export async function authenticateJWT(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    logger.warn('Authentication failed: missing authorization header', { ip: req.ip });
    sendError(res, 'Authorization header is missing', 401);
    return;
  }

  const parts = authHeader.split(' ');

  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    logger.warn('Authentication failed: invalid header format', { ip: req.ip });
    sendError(res, 'Invalid authorization header format. Expected: Bearer <token>', 401);
    return;
  }

  const token = parts[1];

  try {
    // 1) Supabase token'ı doğrula
    const supabaseUser = createSupabaseUserClient(token);
    const { data: authData, error: authError } = await supabaseUser.auth.getUser();

    if (authError || !authData?.user) {
      logger.warn('Authentication failed: invalid or expired token', { ip: req.ip, error: authError?.message });
      sendError(res, 'Invalid or expired token', 401);
      return;
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
      sendError(res, 'Error fetching user data', 500);
      return;
    }

    if (!appUser) {
      logger.warn('Authentication failed: user not found in app_users', { 
        ip: req.ip, 
        supabaseUserId 
      });
      sendError(res, 'User not found', 404);
      return;
    }

    // 3) req.user'a ata
    req.user = {
      sub: appUser.id,
      role: appUser.role,
      client_id: appUser.client_id,
      accessToken: token, // Store token for user-scoped Supabase client
    } as AuthUser;

    logger.debug('Authentication successful', {
      userId: appUser.id,
      role: appUser.role,
      clientId: appUser.client_id,
    });

    next();
  } catch (error) {
    logger.error('Authentication failed: unexpected error', { ip: req.ip, error });
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
      req.user = {
        sub: appUser.id,
        role: appUser.role,
        client_id: appUser.client_id,
        accessToken: token, // Store token for user-scoped Supabase client
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
