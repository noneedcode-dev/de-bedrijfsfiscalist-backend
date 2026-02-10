import { Router, Request, Response } from 'express';
import { param } from 'express-validator';
import { createSupabaseAdminClient } from '../../lib/supabaseClient';
import { asyncHandler } from '../../middleware/errorHandler';
import { handleValidationErrors } from '../../utils/validation';
import { auditLogService } from '../../services/auditLogService';
import { AuditActions } from '../../constants/auditActions';
import * as clientPlansService from '../clientPlans/clientPlans.service';
import * as billingService from './billing.service';

export const billingRouter = Router({ mergeParams: true });

/**
 * GET /api/clients/:clientId/billing/plan
 * Get current plan for the client (client-scoped, read-only)
 */
billingRouter.get(
  '/plan',
  [param('clientId').isUUID().withMessage('clientId must be a valid UUID')],
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const { clientId } = req.params;
    const supabase = createSupabaseAdminClient();

    const currentPlan = await clientPlansService.getCurrentPlan(supabase, clientId);

    return res.json({
      data: currentPlan,
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  })
);

/**
 * GET /api/clients/:clientId/billing/allowance/current
 * Get current month allowance summary (client-scoped, read-only)
 */
billingRouter.get(
  '/allowance/current',
  [param('clientId').isUUID().withMessage('clientId must be a valid UUID')],
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const { clientId } = req.params;
    const supabase = createSupabaseAdminClient();

    const allowanceSummary = await billingService.getCurrentAllowance(supabase, clientId);

    // Audit log
    auditLogService.logAsync({
      client_id: clientId,
      actor_user_id: req.user?.sub,
      actor_role: req.user?.role,
      action: AuditActions.MONTHLY_ALLOWANCE_VIEWED,
      entity_type: 'monthly_allowance',
      metadata: {
        period_start: allowanceSummary.period_start,
        free_minutes_remaining: allowanceSummary.free_minutes_remaining,
        billable_minutes_to_date: allowanceSummary.billable_minutes_to_date,
      },
    });

    return res.json({
      data: allowanceSummary,
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  })
);
