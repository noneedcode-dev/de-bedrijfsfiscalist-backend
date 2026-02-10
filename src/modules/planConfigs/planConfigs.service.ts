import { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../../middleware/errorHandler';
import { ErrorCodes } from '../../constants/errorCodes';
import { DbPlanConfig, PlanCode } from '../../types/database';

export interface ListPlanConfigsParams {
  activeOnly?: boolean;
}

export interface UpdatePlanConfigParams {
  planCode: PlanCode;
  updates: {
    display_name?: string;
    free_minutes_monthly?: number;
    hourly_rate_eur?: string;
    is_active?: boolean;
  };
}

export async function listPlanConfigs(
  supabase: SupabaseClient,
  params?: ListPlanConfigsParams
): Promise<DbPlanConfig[]> {
  let query = supabase
    .from('plan_configs')
    .select('*')
    .order('plan_code', { ascending: true });

  if (params?.activeOnly) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;

  if (error) {
    throw new AppError(
      `Failed to fetch plan configs: ${error.message}`,
      500,
      ErrorCodes.INTERNAL_ERROR
    );
  }

  return (data || []) as DbPlanConfig[];
}

export async function getPlanConfig(
  supabase: SupabaseClient,
  planCode: PlanCode
): Promise<DbPlanConfig> {
  const { data, error } = await supabase
    .from('plan_configs')
    .select('*')
    .eq('plan_code', planCode)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw new AppError(
        `Plan config not found: ${planCode}`,
        404,
        ErrorCodes.PLAN_NOT_FOUND
      );
    }
    throw new AppError(
      `Failed to fetch plan config: ${error.message}`,
      500,
      ErrorCodes.INTERNAL_ERROR
    );
  }

  return data as DbPlanConfig;
}

export async function updatePlanConfig(
  supabase: SupabaseClient,
  params: UpdatePlanConfigParams
): Promise<DbPlanConfig> {
  const updateData: any = {
    updated_at: new Date().toISOString(),
  };

  if (params.updates.display_name !== undefined) {
    updateData.display_name = params.updates.display_name;
  }
  if (params.updates.free_minutes_monthly !== undefined) {
    if (params.updates.free_minutes_monthly < 0) {
      throw new AppError(
        'Free minutes must be non-negative',
        422,
        ErrorCodes.VALIDATION_FAILED
      );
    }
    updateData.free_minutes_monthly = params.updates.free_minutes_monthly;
  }
  if (params.updates.hourly_rate_eur !== undefined) {
    const rate = parseFloat(params.updates.hourly_rate_eur);
    if (isNaN(rate) || rate < 0) {
      throw new AppError(
        'Hourly rate must be a non-negative number',
        422,
        ErrorCodes.VALIDATION_FAILED
      );
    }
    updateData.hourly_rate_eur = params.updates.hourly_rate_eur;
  }
  if (params.updates.is_active !== undefined) {
    updateData.is_active = params.updates.is_active;
  }

  const { data, error } = await supabase
    .from('plan_configs')
    .update(updateData)
    .eq('plan_code', params.planCode)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw new AppError(
        `Plan config not found: ${params.planCode}`,
        404,
        ErrorCodes.PLAN_NOT_FOUND
      );
    }
    throw new AppError(
      `Failed to update plan config: ${error.message}`,
      500,
      ErrorCodes.PLAN_CONFIG_UPDATE_FAILED
    );
  }

  return data as DbPlanConfig;
}
