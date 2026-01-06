import { z } from 'zod';

export const ColorEnum = z.enum(['green', 'orange', 'red', 'none']);
export type Color = z.infer<typeof ColorEnum>;

export const SectionEnum = z.enum(['B3:E8', 'J14:N14']);
export type Section = z.infer<typeof SectionEnum>;

export const MatrixCellSchema = z.object({
  row: z.number().int().min(0),
  col: z.number().int().min(0),
  value_text: z.string().optional(),
  value_number: z.number().optional(),
  color: ColorEnum,
});

export type MatrixCell = z.infer<typeof MatrixCellSchema>;

export const SectionDataSchema = z.object({
  rows: z.number().int().positive(),
  cols: z.number().int().positive(),
  cells: z.array(MatrixCellSchema),
});

export type SectionData = z.infer<typeof SectionDataSchema>;

export const UpdateMatrixRequestSchema = z.object({
  sections: z.record(SectionEnum, SectionDataSchema),
});

export type UpdateMatrixRequest = z.infer<typeof UpdateMatrixRequestSchema>;

export const MatrixCellDbSchema = z.object({
  id: z.string().uuid(),
  client_id: z.string().uuid(),
  section: SectionEnum,
  row_index: z.number().int().min(0),
  col_index: z.number().int().min(0),
  value_text: z.string().nullable(),
  value_number: z.number().nullable(),
  color: ColorEnum,
  updated_by: z.string().uuid().nullable(),
  updated_at: z.string(),
  created_at: z.string(),
});

export type MatrixCellDb = z.infer<typeof MatrixCellDbSchema>;

export const MatrixResponseSchema = z.object({
  client_id: z.string().uuid(),
  sections: z.record(
    z.string(),
    z.object({
      rows: z.number().int().positive(),
      cols: z.number().int().positive(),
      cells: z.array(
        z.object({
          row: z.number().int().min(0),
          col: z.number().int().min(0),
          value_text: z.string().optional(),
          value_number: z.number().optional(),
          color: ColorEnum,
        })
      ),
    })
  ),
});

export type MatrixResponse = z.infer<typeof MatrixResponseSchema>;

export const SECTION_BOUNDS: Record<Section, { rows: number; cols: number }> = {
  'B3:E8': { rows: 6, cols: 4 },
  'J14:N14': { rows: 1, cols: 5 },
};
