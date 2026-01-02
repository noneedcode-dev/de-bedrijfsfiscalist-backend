// src/utils/validation.ts
import { validationResult } from 'express-validator';
import { Request, Response, NextFunction } from 'express';
import { AppError } from '../middleware/errorHandler';
import { ErrorCodes } from '../constants/errorCodes';

export function handleValidationErrors(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const messages = errors.array().map(err => err.msg).join(', ');
    const details = errors.array().map(err => ({
      field: err.type === 'field' ? (err as any).path : err.type,
      message: err.msg,
    }));
    throw new AppError(
      `Validation failed: ${messages}`,
      422,
      ErrorCodes.VALIDATION_FAILED,
      details
    );
  }
  next();
}

