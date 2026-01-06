import { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../../middleware/errorHandler';
import { AuthUser } from '../../types/express';
import { computeScore, computeLevel, RiskLevel } from '../../shared/riskScoring';

export interface RiskScore {
  score: number;
  level: RiskLevel;
}

export function computeRisk(chance: number | null, impact: number | null): RiskScore {
  const score = computeScore(chance, impact);
  const level = computeLevel(score);
  return { score, level };
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
  owner_user_id?: string;
}

async function getUserDisplay(
  supabase: SupabaseClient,
  userId: string
): Promise<string> {
  const { data: appUserData } = await supabase
    .from('app_users')
    .select('full_name, email')
    .eq('id', userId)
    .single();

  return appUserData?.full_name || appUserData?.email || userId;
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

  const { score, level } = computeRisk(input.chance, input.impact);

  const createdByUserId = user.sub;
  const createdByDisplay = await getUserDisplay(supabase, createdByUserId);

  let ownerUserId: string;
  if (input.owner_user_id && user.role === 'admin') {
    const { data: ownerExists } = await supabase
      .from('app_users')
      .select('id')
      .eq('id', input.owner_user_id)
      .single();

    if (!ownerExists) {
      throw new AppError('Invalid owner_user_id: user not found', 400);
    }
    ownerUserId = input.owner_user_id;
  } else {
    ownerUserId = createdByUserId;
  }

  const ownerDisplay = await getUserDisplay(supabase, ownerUserId);

  const insertData = {
    client_id: clientId,
    process_id: processId,
    risk_description: input.risk_description,
    created_by_user_id: createdByUserId,
    created_by_display: createdByDisplay,
    owner_user_id: ownerUserId,
    owner_display: ownerDisplay,
    owner: ownerDisplay,
    response: input.response || 'Monitor',
    inherent_likelihood: input.chance,
    inherent_impact: input.impact,
    inherent_score: score,
    inherent_color: level,
    control_description: input.control_measure,
  };

  const { data, error } = await supabase
    .from('tax_risk_control_rows')
    .insert(insertData)
    .select('*, process:tax_function_rows(process_name)')
    .single();

  if (error) {
    throw new AppError(`Failed to create risk control: ${error.message}`, 500);
  }

  const flattenedData = {
    ...data,
    process_name: data.process?.process_name ?? null,
    process: undefined,
  };

  return flattenedData;
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
    .select('*, process:tax_function_rows(process_name)')
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

  const flattenedData = (data || []).map((row: any) => ({
    ...row,
    process_name: row.process?.process_name ?? null,
    process: undefined,
  }));

  return {
    data: flattenedData,
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
    .select('*, process:tax_function_rows(process_name)')
    .eq('id', id)
    .eq('client_id', clientId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw new AppError('Risk control not found', 404);
    }
    throw new AppError(`Failed to retrieve risk control: ${error.message}`, 500);
  }

  const flattenedData = {
    ...data,
    process_name: data.process?.process_name ?? null,
    process: undefined,
  };

  return flattenedData;
}

export interface UpdateRiskControlInput {
  process_name?: string;
  process_id?: string;
  risk_description?: string;
  response?: string;
  chance?: number;
  impact?: number;
  control_measure?: string;
  owner_user_id?: string;
}

export async function updateRiskControl(
  supabase: SupabaseClient,
  clientId: string,
  id: string,
  input: UpdateRiskControlInput,
  user: AuthUser
) {
  const existing = await getRiskControlById(supabase, clientId, id);

  let processId = input.process_id !== undefined ? input.process_id : existing.process_id;

  if (input.process_id === undefined && input.process_name) {
    processId = await upsertProcess(supabase, clientId, input.process_name);
  }

  const chance = input.chance !== undefined ? input.chance : existing.inherent_likelihood;
  const impact = input.impact !== undefined ? input.impact : existing.inherent_impact;
  const { score, level } = computeRisk(chance, impact);

  const updateData: any = {
    process_id: processId,
    inherent_likelihood: chance,
    inherent_impact: impact,
    inherent_score: score,
    inherent_color: level,
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

  if (input.owner_user_id !== undefined) {
    if (user.role !== 'admin') {
      throw new AppError('Only admins can change the owner', 403);
    }

    const { data: ownerExists } = await supabase
      .from('app_users')
      .select('id')
      .eq('id', input.owner_user_id)
      .single();

    if (!ownerExists) {
      throw new AppError('Invalid owner_user_id: user not found', 400);
    }

    const ownerDisplay = await getUserDisplay(supabase, input.owner_user_id);
    updateData.owner_user_id = input.owner_user_id;
    updateData.owner_display = ownerDisplay;
    updateData.owner = ownerDisplay;
  }

  const { data, error } = await supabase
    .from('tax_risk_control_rows')
    .update(updateData)
    .eq('id', id)
    .eq('client_id', clientId)
    .select('*, process:tax_function_rows(process_name)')
    .single();

  if (error) {
    throw new AppError(`Failed to update risk control: ${error.message}`, 500);
  }

  const flattenedData = {
    ...data,
    process_name: data.process?.process_name ?? null,
    process: undefined,
  };

  return flattenedData;
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

export interface RiskSummaryByLevel {
  green: number;
  orange: number;
  red: number;
}

export interface RiskSummaryByStatus {
  open: number;
  closed: number;
}

export interface TopRisk {
  id: string;
  title: string;
  likelihood: number;
  impact: number;
  score: number;
  level: RiskLevel;
  status: string;
}

export interface RiskSummaryResponse {
  total_risks: number;
  by_level: RiskSummaryByLevel;
  by_status: RiskSummaryByStatus;
  top_risks: TopRisk[];
}

export async function getRiskSummary(
  supabase: SupabaseClient,
  clientId: string
): Promise<RiskSummaryResponse> {
  const { data: risks, error } = await supabase
    .from('tax_risk_control_rows')
    .select('id, risk_description, inherent_likelihood, inherent_impact, inherent_score, inherent_color, response')
    .eq('client_id', clientId);

  if (error) {
    throw new AppError(`Failed to fetch risk summary: ${error.message}`, 500);
  }

  const total_risks = risks?.length || 0;

  const by_level: RiskSummaryByLevel = {
    green: 0,
    orange: 0,
    red: 0,
  };

  const by_status: RiskSummaryByStatus = {
    open: 0,
    closed: 0,
  };

  if (risks) {
    for (const risk of risks) {
      const score = risk.inherent_score || 0;
      const level = computeLevel(score);
      if (level === 'green' || level === 'orange' || level === 'red') {
        by_level[level]++;
      }

      const status = risk.response === 'Accept' ? 'closed' : 'open';
      by_status[status]++;
    }
  }

  const topRisksData = risks
    ?.filter((r) => r.response !== 'Accept')
    .sort((a, b) => (b.inherent_score || 0) - (a.inherent_score || 0))
    .slice(0, 5)
    .map((r) => ({
      id: r.id,
      title: r.risk_description || '',
      likelihood: r.inherent_likelihood || 0,
      impact: r.inherent_impact || 0,
      score: r.inherent_score || 0,
      level: computeLevel(r.inherent_score || 0),
      status: r.response === 'Accept' ? 'closed' : 'open',
    })) || [];

  return {
    total_risks,
    by_level,
    by_status,
    top_risks: topRisksData,
  };
}

export interface HeatmapCell {
  likelihood: number;
  impact: number;
  count_total: number;
  by_level: RiskSummaryByLevel;
}

export interface HeatmapResponse {
  cells: HeatmapCell[];
  axes: {
    likelihood: number[];
    impact: number[];
  };
  thresholds: {
    green_max: number;
    orange_max: number;
    red_max: number;
  };
}

export async function getRiskHeatmap(
  supabase: SupabaseClient,
  clientId: string
): Promise<HeatmapResponse> {
  const { data: aggregatedData, error } = await supabase.rpc('get_risk_heatmap_aggregation', {
    p_client_id: clientId,
  });

  if (error) {
    throw new AppError(`Failed to fetch risk heatmap: ${error.message}`, 500);
  }

  const cells: HeatmapCell[] = (aggregatedData || []).map((row: any) => {
    const likelihood = row.likelihood;
    const impact = row.impact;
    const count_total = row.count_total;
    const score = computeScore(likelihood, impact);
    const level = computeLevel(score);

    const by_level: RiskSummaryByLevel = {
      green: 0,
      orange: 0,
      red: 0,
    };
    if (level === 'green' || level === 'orange' || level === 'red') {
      by_level[level] = count_total;
    }

    return {
      likelihood,
      impact,
      count_total,
      by_level,
    };
  });

  return {
    cells,
    axes: {
      likelihood: [1, 2, 3, 4, 5],
      impact: [1, 2, 3, 4, 5],
    },
    thresholds: {
      green_max: 5,
      orange_max: 12,
      red_max: 25,
    },
  };
}
