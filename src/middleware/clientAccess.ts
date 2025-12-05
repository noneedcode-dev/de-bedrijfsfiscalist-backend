// src/middleware/clientAccess.ts
import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler';

/**
 * URL'deki clientId ile JWT'deki client_id'yi karşılaştırır
 * Admin rolü tüm clientlara erişebilir
 * Client rolü sadece kendi kaydına erişebilir
 */
export function validateClientAccess(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const urlClientId = req.params.clientId;
  const user = req.user;

  if (!user) {
    throw new AppError('User not authenticated', 401);
  }

  // Admin tüm clientlara erişebilir
  if (user.role === 'admin') {
    return next();
  }

  // Client sadece kendi kaydına erişebilir
  if (user.role === 'client' && user.client_id !== urlClientId) {
    throw new AppError(
      'Forbidden: You do not have access to this client',
      403
    );
  }

  next();
}

