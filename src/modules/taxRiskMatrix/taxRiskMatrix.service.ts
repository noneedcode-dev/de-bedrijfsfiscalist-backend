import { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../../middleware/errorHandler';
import { UpdateCellRequest } from './taxRiskMatrix.schema';
import { computeScore, computeColor } from '../../shared/riskScoring';
import {
  MatrixGridResponse,
  InitializeResponse,
  MatrixCell,
  Topic,
  Dimension,
  DEFAULT_DIMENSIONS,
  DEFAULT_TOPICS,
} from './taxRiskMatrix.types';

export async function initializeMatrix(
  supabase: SupabaseClient,
  clientId: string
): Promise<InitializeResponse> {
  let topicsCreated = 0;
  let dimensionsCreated = 0;
  let cellsCreated = 0;

  const { data: existingTopics } = await supabase
    .from('tax_risk_topics')
    .select('id, name')
    .eq('client_id', clientId);

  const existingTopicNames = new Set(existingTopics?.map((t: any) => t.name) || []);
  const topicIds: string[] = [];

  for (let i = 0; i < DEFAULT_TOPICS.length; i++) {
    const topicName = DEFAULT_TOPICS[i];
    if (!existingTopicNames.has(topicName)) {
      const { data, error } = await supabase
        .from('tax_risk_topics')
        .insert({
          client_id: clientId,
          name: topicName,
          sort_order: i,
          is_active: true,
        })
        .select('id')
        .single();

      if (error) {
        throw new AppError(`Failed to create topic ${topicName}: ${error.message}`, 500);
      }
      topicsCreated++;
      topicIds.push(data.id);
    } else {
      const existing = existingTopics?.find((t: any) => t.name === topicName);
      if (existing) topicIds.push(existing.id);
    }
  }

  const { data: existingDimensions } = await supabase
    .from('tax_risk_dimensions')
    .select('id, name')
    .eq('client_id', clientId);

  const existingDimensionNames = new Set(existingDimensions?.map((d: any) => d.name) || []);
  const dimensionIds: string[] = [];

  for (let i = 0; i < DEFAULT_DIMENSIONS.length; i++) {
    const dimensionName = DEFAULT_DIMENSIONS[i];
    if (!existingDimensionNames.has(dimensionName)) {
      const { data, error } = await supabase
        .from('tax_risk_dimensions')
        .insert({
          client_id: clientId,
          name: dimensionName,
          sort_order: i,
          is_active: true,
        })
        .select('id')
        .single();

      if (error) {
        throw new AppError(`Failed to create dimension ${dimensionName}: ${error.message}`, 500);
      }
      dimensionsCreated++;
      dimensionIds.push(data.id);
    } else {
      const existing = existingDimensions?.find((d: any) => d.name === dimensionName);
      if (existing) dimensionIds.push(existing.id);
    }
  }

  const { data: allTopics } = await supabase
    .from('tax_risk_topics')
    .select('id')
    .eq('client_id', clientId);

  const { data: allDimensions } = await supabase
    .from('tax_risk_dimensions')
    .select('id')
    .eq('client_id', clientId);

  const allTopicIds = allTopics?.map((t: any) => t.id) || [];
  const allDimensionIds = allDimensions?.map((d: any) => d.id) || [];

  for (const topicId of allTopicIds) {
    for (const dimensionId of allDimensionIds) {
      const { data: existingCell } = await supabase
        .from('tax_risk_matrix_cells')
        .select('id')
        .eq('client_id', clientId)
        .eq('topic_id', topicId)
        .eq('dimension_id', dimensionId)
        .maybeSingle();

      if (!existingCell) {
        const { error } = await supabase
          .from('tax_risk_matrix_cells')
          .insert({
            client_id: clientId,
            topic_id: topicId,
            dimension_id: dimensionId,
            likelihood: 1,
            impact: 1,
            status: 'open',
          });

        if (error) {
          throw new AppError(`Failed to create cell: ${error.message}`, 500);
        }
        cellsCreated++;
      }
    }
  }

  const { count: totalTopics } = await supabase
    .from('tax_risk_topics')
    .select('*', { count: 'exact', head: true })
    .eq('client_id', clientId);

  const { count: totalDimensions } = await supabase
    .from('tax_risk_dimensions')
    .select('*', { count: 'exact', head: true })
    .eq('client_id', clientId);

  const { count: totalCells } = await supabase
    .from('tax_risk_matrix_cells')
    .select('*', { count: 'exact', head: true })
    .eq('client_id', clientId);

  return {
    topics_created: topicsCreated,
    dimensions_created: dimensionsCreated,
    cells_created: cellsCreated,
    total_topics: totalTopics || 0,
    total_dimensions: totalDimensions || 0,
    total_cells: totalCells || 0,
  };
}

export async function getMatrixGrid(
  supabase: SupabaseClient,
  clientId: string
): Promise<MatrixGridResponse> {
  const { data: topicsData, error: topicsError } = await supabase
    .from('tax_risk_topics')
    .select('id, name, sort_order, is_active')
    .eq('client_id', clientId)
    .order('sort_order')
    .order('name');

  if (topicsError) {
    throw new AppError(`Failed to fetch topics: ${topicsError.message}`, 500);
  }

  const { data: dimensionsData, error: dimensionsError } = await supabase
    .from('tax_risk_dimensions')
    .select('id, name, sort_order, is_active')
    .eq('client_id', clientId)
    .order('sort_order')
    .order('name');

  if (dimensionsError) {
    throw new AppError(`Failed to fetch dimensions: ${dimensionsError.message}`, 500);
  }

  const { data: cellsData, error: cellsError } = await supabase
    .from('tax_risk_matrix_cells')
    .select('*')
    .eq('client_id', clientId);

  if (cellsError) {
    throw new AppError(`Failed to fetch cells: ${cellsError.message}`, 500);
  }

  const topics: Topic[] = topicsData.map((t: any) => ({
    id: t.id,
    name: t.name,
    sort_order: t.sort_order,
    is_active: t.is_active,
  }));

  const dimensions: Dimension[] = dimensionsData.map((d: any) => ({
    id: d.id,
    name: d.name,
    sort_order: d.sort_order,
    is_active: d.is_active,
  }));

  const cells: MatrixCell[] = cellsData.map((c: any) => {
    const score = computeScore(c.likelihood, c.impact);
    const color = computeColor(c.likelihood, c.impact);
    return {
      id: c.id,
      topic_id: c.topic_id,
      dimension_id: c.dimension_id,
      likelihood: c.likelihood,
      impact: c.impact,
      score,
      color,
      status: c.status,
      notes: c.notes,
      owner_user_id: c.owner_user_id,
      last_reviewed_at: c.last_reviewed_at,
      updated_at: c.updated_at,
    };
  });

  return {
    topics,
    dimensions,
    cells,
  };
}

export async function updateCell(
  supabase: SupabaseClient,
  clientId: string,
  cellId: string,
  updates: UpdateCellRequest
): Promise<MatrixCell> {
  const { data: existingCell, error: fetchError } = await supabase
    .from('tax_risk_matrix_cells')
    .select('*')
    .eq('id', cellId)
    .eq('client_id', clientId)
    .single();

  if (fetchError || !existingCell) {
    throw new AppError('Cell not found', 404);
  }

  const updateData: any = {
    updated_at: new Date().toISOString(),
  };

  if (updates.likelihood !== undefined) {
    updateData.likelihood = updates.likelihood;
  }
  if (updates.impact !== undefined) {
    updateData.impact = updates.impact;
  }
  if (updates.status !== undefined) {
    updateData.status = updates.status;
  }
  if (updates.notes !== undefined) {
    updateData.notes = updates.notes;
  }
  if (updates.owner_user_id !== undefined) {
    updateData.owner_user_id = updates.owner_user_id;
  }
  if (updates.last_reviewed_at !== undefined) {
    updateData.last_reviewed_at = updates.last_reviewed_at;
  }

  const { data: updatedCell, error: updateError } = await supabase
    .from('tax_risk_matrix_cells')
    .update(updateData)
    .eq('id', cellId)
    .eq('client_id', clientId)
    .select('*')
    .single();

  if (updateError || !updatedCell) {
    throw new AppError(`Failed to update cell: ${updateError?.message}`, 500);
  }

  const score = computeScore(updatedCell.likelihood, updatedCell.impact);
  const color = computeColor(updatedCell.likelihood, updatedCell.impact);

  return {
    id: updatedCell.id,
    topic_id: updatedCell.topic_id,
    dimension_id: updatedCell.dimension_id,
    likelihood: updatedCell.likelihood,
    impact: updatedCell.impact,
    score,
    color,
    status: updatedCell.status,
    notes: updatedCell.notes,
    owner_user_id: updatedCell.owner_user_id,
    last_reviewed_at: updatedCell.last_reviewed_at,
    updated_at: updatedCell.updated_at,
  };
}
