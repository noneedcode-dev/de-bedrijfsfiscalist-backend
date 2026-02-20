import { Router } from 'express';
import { query } from 'express-validator';
import { asyncHandler } from '../../middleware/errorHandler';
import { handleValidationErrors } from '../../utils/validation';
import { authenticateJWT, requireRole } from '../auth/auth.middleware';
import * as adminController from './timeEntries.admin.controller';

export const timeEntriesAdminRouter = Router();

timeEntriesAdminRouter.get(
  '/',
  authenticateJWT,
  requireRole('admin'),
  [
    query('client_id').optional().isUUID().withMessage('Invalid client_id format'),
    query('advisor_id').optional().isUUID().withMessage('Invalid advisor_id format'),
    query('billable').optional().isIn(['true', 'false']).withMessage('billable must be true or false'),
    query('from').optional().isDate().withMessage('Invalid from date format (YYYY-MM-DD)'),
    query('to').optional().isDate().withMessage('Invalid to date format (YYYY-MM-DD)'),
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('page must be a positive integer')
      .toInt(),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 200 })
      .withMessage('limit must be between 1 and 200')
      .toInt(),
  ],
  handleValidationErrors,
  asyncHandler(adminController.listAllTimeEntries)
);
