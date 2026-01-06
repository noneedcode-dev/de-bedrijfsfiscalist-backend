# Tax Risk Matrix Module - Production Ready Implementation

## Overview
The Tax Risk Matrix module is now fully implemented and production-ready, following the client-scoped routing pattern consistent with other modules in the system.

## Implementation Summary

### ✅ Database Schema
**Migration:** `20260108_restore_topic_dimension_matrix.sql`

Three tables implementing the topic×dimension model:
- `tax_risk_topics` - Configurable risk topics (VAT, Corporate Income Tax, etc.)
- `tax_risk_dimensions` - Risk dimensions (Compliance, Reporting, Documentation, etc.)
- `tax_risk_matrix_cells` - Individual risk assessments at topic×dimension intersections

**Key Features:**
- Proper foreign key relationships with CASCADE deletes
- UNIQUE constraint on (client_id, topic_id, dimension_id)
- Check constraints: likelihood and impact between 1-5
- Status enum: 'open', 'in_progress', 'closed'
- RLS policies for tenant isolation
- Optimized indexes for client_id and status queries

### ✅ API Endpoints

All endpoints follow the client-scoped pattern: `/api/clients/:clientId/tax/risk-matrix/*`

#### 1. POST `/api/clients/:clientId/tax/risk-matrix/initialize`
**Purpose:** Initialize matrix with default topics and dimensions

**Default Topics (8):**
- VAT
- Corporate Income Tax
- Payroll Tax
- Transfer Pricing
- Withholding Tax
- Financial Reporting
- International VAT/OSS/IOSS
- Other

**Default Dimensions (5):**
- Compliance
- Reporting
- Documentation
- Process
- IT/Systems

**Response:**
```json
{
  "data": {
    "topics_created": 8,
    "dimensions_created": 5,
    "cells_created": 40,
    "total_topics": 8,
    "total_dimensions": 5,
    "total_cells": 40
  }
}
```

**Features:**
- Idempotent operation (safe to call multiple times)
- Creates all topic×dimension cells with default likelihood=1, impact=1, status='open'

#### 2. GET `/api/clients/:clientId/tax/risk-matrix`
**Purpose:** Retrieve complete matrix grid for UI rendering

**Response:**
```json
{
  "data": {
    "topics": [
      {
        "id": "uuid",
        "name": "VAT",
        "sort_order": 0,
        "is_active": true
      }
    ],
    "dimensions": [
      {
        "id": "uuid",
        "name": "Compliance",
        "sort_order": 0,
        "is_active": true
      }
    ],
    "cells": [
      {
        "id": "uuid",
        "topic_id": "uuid",
        "dimension_id": "uuid",
        "likelihood": 3,
        "impact": 4,
        "score": 12,
        "color": "orange",
        "status": "open",
        "notes": null,
        "owner_user_id": null,
        "last_reviewed_at": null,
        "updated_at": "2026-01-06T00:00:00Z"
      }
    ]
  }
}
```

**Features:**
- Computed `score` = likelihood × impact
- Computed `color` based on shared risk scoring thresholds:
  - Green: score 1-5
  - Orange: score 6-12
  - Red: score 13-25
- Sorted by sort_order, then name
- Only returns green/orange/red (never "amber")

#### 3. PATCH `/api/clients/:clientId/tax/risk-matrix/cells/:cellId`
**Purpose:** Update individual cell values

**Request Body:**
```json
{
  "likelihood": 4,
  "impact": 3,
  "status": "in_progress",
  "notes": "Updated assessment",
  "owner_user_id": "uuid",
  "last_reviewed_at": "2026-01-06T12:00:00Z"
}
```

**Response:**
```json
{
  "data": {
    "id": "uuid",
    "topic_id": "uuid",
    "dimension_id": "uuid",
    "likelihood": 4,
    "impact": 3,
    "score": 12,
    "color": "orange",
    "status": "in_progress",
    "notes": "Updated assessment",
    "owner_user_id": "uuid",
    "last_reviewed_at": "2026-01-06T12:00:00Z",
    "updated_at": "2026-01-06T12:00:00Z"
  }
}
```

**Validation:**
- likelihood: integer 1-5
- impact: integer 1-5
- status: enum ['open', 'in_progress', 'closed']
- owner_user_id: UUID or null
- last_reviewed_at: ISO datetime or null

### ✅ Security & Validation

**Authentication & Authorization:**
- All endpoints require API key (`x-api-key` header)
- All endpoints require JWT authentication
- `validateClientAccess` middleware ensures tenant isolation
- Admin users can access any client's data
- Client users can only access their own data

**Validation:**
- clientId must be valid UUID (403 if access denied)
- cellId must be valid UUID (422 if invalid format)
- Request body validated with Zod schemas
- Database-level constraints enforce data integrity

### ✅ Risk Scoring

Uses shared risk scoring module (`src/shared/riskScoring.ts`):
- `computeScore(likelihood, impact)` → likelihood × impact
- `computeColor(likelihood, impact)` → 'green' | 'orange' | 'red'

**Thresholds** (from `src/shared/riskThresholds.ts`):
- GREEN_MAX = 5
- ORANGE_MAX = 12
- RED_MAX = 25

### ✅ Testing

**Test Coverage:** 19 passing tests + 2 skipped integration tests

**Test Categories:**
1. **Authentication & Authorization**
   - API key requirement
   - JWT requirement
   - Client access validation

2. **GET Endpoint**
   - Returns correct structure (topics, dimensions, cells)
   - Computed score and color are correct
   - No "amber" in responses (only green/orange/red)
   - Stable sorting by sort_order then name

3. **PATCH Endpoint**
   - Updates values and recalculates score/color
   - Validates likelihood range (1-5)
   - Validates impact range (1-5)
   - Validates status enum
   - Validates UUID formats
   - Multiple field updates work correctly

4. **Tenant Isolation**
   - Cannot access another client's cells

**Skipped Tests:**
- Initialize endpoint (requires real DB for complex multi-insert logic)
- Idempotency test (requires real DB to verify unique constraints)

### ✅ OpenAPI Documentation

All endpoints fully documented with:
- Request/response schemas
- Parameter descriptions
- Error responses (401, 403, 404, 422, 500)
- Example values
- Enum constraints

Documentation available at: `/api-docs` (dev/staging only)

## File Structure

```
src/modules/taxRiskMatrix/
├── taxRiskMatrix.routes.ts    # Express routes with OpenAPI docs
├── taxRiskMatrix.service.ts   # Business logic layer
├── taxRiskMatrix.schema.ts    # Zod validation schemas
└── taxRiskMatrix.types.ts     # TypeScript interfaces

tests/
└── taxRiskMatrix.test.ts      # Comprehensive test suite

supabase/migrations/
└── 20260108_restore_topic_dimension_matrix.sql  # Database schema
```

## Integration Points

**App Registration:** `src/app.ts`
```typescript
clientRouter.use('/tax/risk-matrix', taxRiskMatrixRouter);
```

**Shared Dependencies:**
- `src/shared/riskScoring.ts` - Risk calculation logic
- `src/shared/riskThresholds.ts` - Color thresholds
- `src/middleware/clientAccess.ts` - Tenant isolation
- `src/middleware/errorHandler.ts` - Error handling
- `src/lib/supabaseClient.ts` - Database client

## Production Readiness Checklist

- ✅ Database schema with proper constraints and indexes
- ✅ RLS policies for tenant isolation
- ✅ Client-scoped routing pattern
- ✅ Comprehensive validation (Zod + express-validator)
- ✅ Error handling with standard error codes
- ✅ OpenAPI documentation
- ✅ Unit tests with mocked dependencies
- ✅ TypeScript type safety
- ✅ Consistent with existing module patterns
- ✅ No "amber" references (only green/orange/red)
- ✅ Idempotent initialization
- ✅ Computed fields (score, color) never stored in DB
- ✅ Build passes without errors

## Usage Example

```bash
# 1. Initialize matrix for a client
POST /api/clients/123e4567-e89b-12d3-a456-426614174000/tax/risk-matrix/initialize
Headers:
  x-api-key: your-api-key
  Authorization: Bearer your-jwt-token

# 2. Get matrix grid
GET /api/clients/123e4567-e89b-12d3-a456-426614174000/tax/risk-matrix
Headers:
  x-api-key: your-api-key
  Authorization: Bearer your-jwt-token

# 3. Update a cell
PATCH /api/clients/123e4567-e89b-12d3-a456-426614174000/tax/risk-matrix/cells/cell-uuid
Headers:
  x-api-key: your-api-key
  Authorization: Bearer your-jwt-token
Body:
{
  "likelihood": 4,
  "impact": 3,
  "status": "in_progress",
  "notes": "Risk mitigation in progress"
}
```

## Notes

- The module uses the existing database migration (`20260108_restore_topic_dimension_matrix.sql`)
- All computed values (score, color) are calculated at runtime, never stored
- The module follows the same patterns as other tax modules (calendar, controls, function)
- Admin users bypass RLS and can access any client's data
- Client users are restricted to their own data via RLS policies
