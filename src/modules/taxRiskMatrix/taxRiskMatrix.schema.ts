import { z } from 'zod';

export const RiskColorEnum = z.enum(['green', 'orange', 'red']);
export type RiskColor = z.infer<typeof RiskColorEnum>;

export const StatusEnum = z.enum(['open', 'in_progress', 'closed']);
export type Status = z.infer<typeof StatusEnum>;

export const UpdateCellRequestSchema = z.object({
  likelihood: z.number().int().min(1).max(5).optional(),
  impact: z.number().int().min(1).max(5).optional(),
  status: StatusEnum.optional(),
  notes: z.string().optional(),
  owner_user_id: z.string().uuid().nullable().optional(),
  last_reviewed_at: z.string().datetime().nullable().optional(),
});

export type UpdateCellRequest = z.infer<typeof UpdateCellRequestSchema>;
