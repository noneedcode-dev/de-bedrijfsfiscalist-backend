import { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../../middleware/errorHandler';
import { AuthUser } from '../../types/express';

export interface RiskScore {
  score: number;
  color: string;
}

export function computeRisk(chance: number | null, impact: number | null): RiskScore {
  if (chance === null || impact === null) {
    return { score: 0, color: 'green' };
  }

  const score = chance * impact;
  let color = 'green';
  if (score >= 15) {
    color = 'red';
  } else if (score >= 7) {
    color = 'amber';
  }

  return { score, color };
}

export async function upsertProcess(
  supabase: SupabaseClient,
  clientId: string,
  processName: string
): Promise<string> {
  const { data, error } = await supabase
    .from('tax_function_rows')
    .upsert(
      { client_id: clientId, process_name: processName },
      { onConflict: 'client_id,process_name' }
    )
    .select('id')
    .single();

  if (error) {
    throw new AppError(`Failed to upsert process: ${error.message}`, 500);
  }

  if (!data || !data.id) {
    throw new AppError('Failed to retrieve process ID after upsert', 500);
  }

  return data.id;
}

export interface CreateRiskControlInput {
  process_name?: string;
  process_id?: string;
  risk_description: string;
  response?: string;
  chance: number;
  impact: number;
  control_measure: string;
}

export async function createRiskControl(
  supabase: SupabaseClient,
  clientId: string,
  input: CreateRiskControlInput,
  user: AuthUser
) {
  let processId = input.process_id || null;

  if (!processId && input.process_name) {
    processId = await upsertProcess(supabase, clientId, input.process_name);
  }

  const { score, color } = computeRisk(input.chance, input.impact);

  const ownerUserId = user.sub;
  const { data: appUserData } = await supabase
    .from('app_users')
    .select('email')
    .eq('id', ownerUserId)
    .single();

  const ownerDisplay = appUserData?.email || ownerUserId;

  const insertData = {
    client_id: clientId,
    process_id: processId,
    risk_description: input.risk_description,
    owner_user_id: ownerUserId,
    owner_display: ownerDisplay,
    owner: ownerDisplay,
    response: input.response || 'Monitor',
    inherent_likelihood: input.chance,
    inherent_impact: input.impact,
    inherent_score: score,
    inherent_color: color,
    control_description: input.control_measure,
  };

  const { data, error } = await supabase
    .from('tax_risk_control_rows')
    .insert(insertData)
    .select('*')
    .single();

  if (error) {
    throw new AppError(`Failed to create risk control: ${error.message}`, 500);
  }

  return data;
}

export interface RiskControlFilters {
  process_id?: string;
  response?: string;
  min_score?: number;
  max_score?: number;
  sort?: string;
}

export interface PaginationOptions {
  limit: number;
  offset: number;
}

export async function listRiskControls(
  supabase: SupabaseClient,
  clientId: string,
  filters: RiskControlFilters,
  pagination: PaginationOptions
) {
  let countQuery = supabase
    .from('tax_risk_control_rows')
    .select('*', { count: 'exact', head: true })
    .eq('client_id', clientId);

  let query = supabase
    .from('tax_risk_control_rows')
    .select('*')
    .eq('client_id', clientId);

  if (filters.process_id) {
    query = query.eq('process_id', filters.process_id);
    countQuery = countQuery.eq('process_id', filters.process_id);
  }

  if (filters.response) {
    query = query.eq('response', filters.response);
    countQuery = countQuery.eq('response', filters.response);
  }

  if (filters.min_score !== undefined) {
    query = query.gte('inherent_score', filters.min_score);
    countQuery = countQuery.gte('inherent_score', filters.min_score);
  }

  if (filters.max_score !== undefined) {
    query = query.lte('inherent_score', filters.max_score);
    countQuery = countQuery.lte('inherent_score', filters.max_score);
  }

  const { count } = await countQuery;

  const sort = filters.sort || 'created_desc';
  if (sort === 'score_desc') {
    query = query.order('inherent_score', { ascending: false });
  } else {
    query = query.order('created_at', { ascending: false });
  }

  query = query.range(pagination.offset, pagination.offset + pagination.limit - 1);

  const { data, error } = await query;

  if (error) {
    throw new AppError(`Failed to list risk controls: ${error.message}`, 500);
  }

  return {
    data: data || [],
    meta: {
      limit: pagination.limit,
      offset: pagination.offset,
      count: count || 0,
    },
  };
}

export async function getRiskControlById(
  supabase: SupabaseClient,
  clientId: string,
  id: string
) {
  const { data, error } = await supabase
    .from('tax_risk_control_rows')
    .select('*')
    .eq('id', id)
    .eq('client_id', clientId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw new AppError('Risk control not found', 404);
    }
    throw new AppError(`Failed to retrieve risk control: ${error.message}`, 500);
  }

  return data;
}

export interface UpdateRiskControlInput {
  process_name?: string;
  process_id?: string;
  risk_description?: string;
  response?: string;
  chance?: number;
  impact?: number;
  control_measure?: string;
}

export async function updateRiskControl(
  supabase: SupabaseClient,
  clientId: string,
  id: string,
  input: UpdateRiskControlInput
) {
  const existing = await getRiskControlById(supabase, clientId, id);

  let processId = input.process_id !== undefined ? input.process_id : existing.process_id;

  if (input.process_id === undefined && input.process_name) {
    processId = await upsertProcess(supabase, clientId, input.process_name);
  }

  const chance = input.chance !== undefined ? input.chance : existing.inherent_likelihood;
  const impact = input.impact !== undefined ? input.impact : existing.inherent_impact;
  const { score, color } = computeRisk(chance, impact);

  const updateData: any = {
    process_id: processId,
    inherent_likelihood: chance,
    inherent_impact: impact,
    inherent_score: score,
    inherent_color: color,
  };

  if (input.risk_description !== undefined) {
    updateData.risk_description = input.risk_description;
  }

  if (input.response !== undefined) {
    updateData.response = input.response;
  }

  if (input.control_measure !== undefined) {
    updateData.control_description = input.control_measure;
  }

  const { data, error } = await supabase
    .from('tax_risk_control_rows')
    .update(updateData)
    .eq('id', id)
    .eq('client_id', clientId)
    .select('*')
    .single();

  if (error) {
    throw new AppError(`Failed to update risk control: ${error.message}`, 500);
  }

  return data;
}

export async function deleteRiskControl(
  supabase: SupabaseClient,
  clientId: string,
  id: string
) {
  await getRiskControlById(supabase, clientId, id);

  const { error } = await supabase
    .from('tax_risk_control_rows')
    .delete()
    .eq('id', id)
    .eq('client_id', clientId);

  if (error) {
    throw new AppError(`Failed to delete risk control: ${error.message}`, 500);
  }
}
