import { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../../middleware/errorHandler';
import { Color, Section, SECTION_BOUNDS, MatrixResponse, UpdateMatrixRequest, MatrixCell } from './taxRiskMatrix.schema';

export function deriveColorFromNumber(value: number | null | undefined): Color {
  if (value === null || value === undefined) {
    return 'none';
  }
  if (value >= 1 && value <= 5) {
    return 'green';
  } else if (value >= 6 && value <= 12) {
    return 'orange';
  } else if (value >= 13 && value <= 25) {
    return 'red';
  }
  return 'none';
}

export function normalizeColor(color: Color | undefined, valueNumber: number | null | undefined): Color {
  if (color && color !== 'none') {
    return color;
  }
  return deriveColorFromNumber(valueNumber);
}

export async function getMatrixForClient(
  supabase: SupabaseClient,
  clientId: string
): Promise<MatrixResponse> {
  const { data, error } = await supabase
    .from('tax_risk_matrix_entries')
    .select('*')
    .eq('client_id', clientId);

  if (error) {
    throw new AppError(`Failed to fetch matrix entries: ${error.message}`, 500);
  }

  const entries = data || [];
  const sections: Record<string, { rows: number; cols: number; cells: MatrixCell[] }> = {};

  for (const [sectionKey, bounds] of Object.entries(SECTION_BOUNDS)) {
    const sectionEntries = entries.filter((e: any) => e.section === sectionKey);
    const cellMap = new Map<string, MatrixCell>();

    for (const entry of sectionEntries) {
      const key = `${entry.row_index}:${entry.col_index}`;
      cellMap.set(key, {
        row: entry.row_index,
        col: entry.col_index,
        value_text: entry.value_text || undefined,
        value_number: entry.value_number !== null ? Number(entry.value_number) : undefined,
        color: entry.color as Color,
      });
    }

    const cells: MatrixCell[] = [];
    for (let row = 0; row < bounds.rows; row++) {
      for (let col = 0; col < bounds.cols; col++) {
        const key = `${row}:${col}`;
        const existingCell = cellMap.get(key);
        if (existingCell) {
          cells.push(existingCell);
        } else {
          cells.push({
            row,
            col,
            color: 'none',
          });
        }
      }
    }

    sections[sectionKey] = {
      rows: bounds.rows,
      cols: bounds.cols,
      cells,
    };
  }

  return {
    client_id: clientId,
    sections,
  };
}

export async function updateMatrixForClient(
  supabase: SupabaseClient,
  clientId: string,
  input: UpdateMatrixRequest,
  updatedBy: string
): Promise<MatrixResponse> {
  for (const [sectionKey, sectionData] of Object.entries(input.sections)) {
    const section = sectionKey as Section;
    const bounds = SECTION_BOUNDS[section];

    if (!bounds) {
      throw new AppError(`Invalid section: ${section}`, 400);
    }

    if (sectionData.rows !== bounds.rows || sectionData.cols !== bounds.cols) {
      throw new AppError(
        `Section ${section} must have exactly ${bounds.rows} rows and ${bounds.cols} cols`,
        400
      );
    }

    for (const cell of sectionData.cells) {
      if (cell.row < 0 || cell.row >= bounds.rows) {
        throw new AppError(
          `Cell row ${cell.row} is out of bounds for section ${section} (max: ${bounds.rows - 1})`,
          400
        );
      }
      if (cell.col < 0 || cell.col >= bounds.cols) {
        throw new AppError(
          `Cell col ${cell.col} is out of bounds for section ${section} (max: ${bounds.cols - 1})`,
          400
        );
      }

      const finalColor = normalizeColor(cell.color, cell.value_number);

      const upsertData = {
        client_id: clientId,
        section,
        row_index: cell.row,
        col_index: cell.col,
        value_text: cell.value_text || null,
        value_number: cell.value_number !== undefined ? cell.value_number : null,
        color: finalColor,
        updated_by: updatedBy,
        updated_at: new Date().toISOString(),
      };

      const { error: upsertError } = await supabase
        .from('tax_risk_matrix_entries')
        .upsert(upsertData, {
          onConflict: 'client_id,section,row_index,col_index',
        });

      if (upsertError) {
        throw new AppError(`Failed to upsert cell: ${upsertError.message}`, 500);
      }
    }
  }

  return getMatrixForClient(supabase, clientId);
}
