// src/utils/pagination.ts
import { Request } from 'express';

export interface PaginationParams {
  limit?: number;
  offset?: number;
  cursor?: string;
}

export interface PaginationMeta {
  limit: number;
  offset?: number;
  count: number;
  total?: number;
  hasMore?: boolean;
  nextCursor?: string;
  timestamp: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

/**
 * Parse pagination parameters from request query
 * @param req Express request object
 * @param defaultLimit Default limit if not specified
 * @param maxLimit Maximum allowed limit
 */
export function parsePaginationParams(
  req: Request,
  defaultLimit: number = 50,
  maxLimit: number = 100
): PaginationParams {
  const limit = req.query.limit
    ? Math.min(parseInt(req.query.limit as string, 10), maxLimit)
    : defaultLimit;

  const offset = req.query.offset
    ? Math.max(0, parseInt(req.query.offset as string, 10))
    : 0;

  const cursor = req.query.cursor as string | undefined;

  return {
    limit: Math.max(1, limit), // Ensure at least 1
    offset,
    cursor,
  };
}

/**
 * Create standardized pagination metadata
 * @param data Result data array
 * @param params Pagination parameters used
 * @param total Optional total count (if available)
 */
export function createPaginationMeta<T>(
  data: T[],
  params: PaginationParams,
  total?: number
): PaginationMeta {
  const meta: PaginationMeta = {
    limit: params.limit || 50,
    count: data.length,
    timestamp: new Date().toISOString(),
  };

  // Offset-based pagination
  if (params.offset !== undefined) {
    meta.offset = params.offset;
    if (total !== undefined) {
      meta.total = total;
      meta.hasMore = params.offset + data.length < total;
    }
  }

  // Cursor-based pagination (for future use)
  if (params.cursor) {
    meta.hasMore = data.length === params.limit;
    // nextCursor would be generated based on last item in data
    // Implementation depends on cursor strategy (e.g., last item's ID or timestamp)
  }

  return meta;
}

/**
 * Create a paginated response with standardized format
 * @param data Result data array
 * @param params Pagination parameters
 * @param total Optional total count
 */
export function createPaginatedResponse<T>(
  data: T[],
  params: PaginationParams,
  total?: number
): PaginatedResponse<T> {
  return {
    data,
    meta: createPaginationMeta(data, params, total),
  };
}

/**
 * Helper to apply pagination to Supabase query builder
 * Works with offset-based pagination
 */
export function applyPagination(
  query: any, // Supabase query builder
  params: PaginationParams
): any {
  const { limit = 50, offset = 0 } = params;
  return query.range(offset, offset + limit - 1);
}
