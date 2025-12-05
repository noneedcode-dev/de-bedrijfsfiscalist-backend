// src/utils/validation.ts
import { validationResult } from 'express-validator';
import { Request, Response, NextFunction } from 'express';
import { AppError } from '../middleware/errorHandler';

export function handleValidationErrors(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const messages = errors.array().map(err => err.msg).join(', ');
    throw new AppError(`Validation failed: ${messages}`, 400);
  }
  next();
}

