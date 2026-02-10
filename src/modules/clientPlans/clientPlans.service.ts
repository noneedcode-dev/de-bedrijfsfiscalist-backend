import { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../../middleware/errorHandler';
import { ErrorCodes } from '../../constants/errorCodes';
import { DbClientPlan, PlanCode } from '../../types/database';

export interface AssignPlanParams {
  clientId: string;
  planCode: PlanCode;
  effectiveFrom: string; // date (YYYY-MM-DD)
  assignedBy?: string;
}

export async function assignPlan(
  supabase: SupabaseClient,
  params: AssignPlanParams
): Promise<{ previousPlan: DbClientPlan | null; newPlan: DbClientPlan }> {
  const { clientId, planCode, effectiveFrom, assignedBy } = params;

  // Validate: effective_from >= today - 7 days (grace period)
  const effectiveDate = new Date(effectiveFrom);
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  sevenDaysAgo.setHours(0, 0, 0, 0);

  if (effectiveDate < sevenDaysAgo) {
    throw new AppError(
      'Plan effective date cannot be more than 7 days in the past',
      422,
      ErrorCodes.PLAN_RETROACTIVE_NOT_ALLOWED
    );
  }

  // Verify plan config exists
  const { data: planConfig, error: planConfigError } = await supabase
    .from('plan_configs')
    .select('plan_code')
    .eq('plan_code', planCode)
    .single();

  if (planConfigError || !planConfig) {
    throw new AppError(
      `Plan config not found: ${planCode}`,
      404,
      ErrorCodes.PLAN_NOT_FOUND
    );
  }

  // Find active plan (effective_to IS NULL)
  const { data: activePlan, error: activePlanError } = await supabase
    .from('client_plans')
    .select('*')
    .eq('client_id', clientId)
    .is('effective_to', null)
    .maybeSingle();

  if (activePlanError) {
    throw new AppError(
      `Failed to fetch active plan: ${activePlanError.message}`,
      500,
      ErrorCodes.INTERNAL_ERROR
    );
  }

  let previousPlan: DbClientPlan | null = null;

  // If there's an active plan, close it
  if (activePlan) {
    // Calculate effective_to (day before new plan starts)
    const effectiveToDate = new Date(effectiveFrom);
    effectiveToDate.setDate(effectiveToDate.getDate() - 1);
    const effectiveTo = effectiveToDate.toISOString().split('T')[0];

    const { data: closedPlan, error: closeError } = await supabase
      .from('client_plans')
      .update({
        effective_to: effectiveTo,
        updated_at: new Date().toISOString(),
      })
      .eq('id', activePlan.id)
      .select()
      .single();

    if (closeError) {
      throw new AppError(
        `Failed to close previous plan: ${closeError.message}`,
        500,
        ErrorCodes.PLAN_ASSIGNMENT_FAILED
      );
    }

    previousPlan = closedPlan as DbClientPlan;
  }

  // Insert new plan
  const { data: newPlan, error: insertError } = await supabase
    .from('client_plans')
    .insert({
      client_id: clientId,
      plan_code: planCode,
      effective_from: effectiveFrom,
      effective_to: null,
      assigned_by: assignedBy || null,
    })
    .select()
    .single();

  if (insertError) {
    throw new AppError(
      `Failed to assign new plan: ${insertError.message}`,
      500,
      ErrorCodes.PLAN_ASSIGNMENT_FAILED
    );
  }

  return {
    previousPlan,
    newPlan: newPlan as DbClientPlan,
  };
}

export async function getCurrentPlan(
  supabase: SupabaseClient,
  clientId: string,
  asOfDate?: string
): Promise<DbClientPlan | null> {
  const targetDate = asOfDate || new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('client_plans')
    .select('*')
    .eq('client_id', clientId)
    .lte('effective_from', targetDate)
    .or(`effective_to.is.null,effective_to.gte.${targetDate}`)
    .order('effective_from', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new AppError(
      `Failed to fetch current plan: ${error.message}`,
      500,
      ErrorCodes.INTERNAL_ERROR
    );
  }

  return data as DbClientPlan | null;
}

export async function listPlanHistory(
  supabase: SupabaseClient,
  clientId: string
): Promise<DbClientPlan[]> {
  const { data, error } = await supabase
    .from('client_plans')
    .select('*')
    .eq('client_id', clientId)
    .order('effective_from', { ascending: false });

  if (error) {
    throw new AppError(
      `Failed to fetch plan history: ${error.message}`,
      500,
      ErrorCodes.INTERNAL_ERROR
    );
  }

  return (data || []) as DbClientPlan[];
}
