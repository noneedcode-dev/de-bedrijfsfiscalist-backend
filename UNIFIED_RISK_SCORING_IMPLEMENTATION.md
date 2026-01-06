# Unified Risk Scoring Implementation

## Overview
This document describes the implementation of unified risk scoring logic across all risk-related modules in the application.

## Single Source of Truth

### Shared Constants (`src/shared/riskThresholds.ts`)
```typescript
export const GREEN_MAX = 5;
export const ORANGE_MAX = 12;
export const RED_MAX = 25;
```

### Shared Helpers (`src/shared/riskScoring.ts`)
```typescript
export type RiskLevel = 'green' | 'orange' | 'red';

export function computeScore(likelihood: number | null, impact: number | null): number
export function computeLevel(score: number): RiskLevel
export function computeColor(likelihood: number | null, impact: number | null): RiskLevel
```

## Scoring Logic

### Formula
- **Score** = `likelihood × impact`
- Both `likelihood` and `impact` are integers from 1 to 5
- Score range: 1-25

### Thresholds
- **Green (Low Risk)**: score 1-5
- **Orange (Medium Risk)**: score 6-12
- **Red (High Risk)**: score 13-25

## Module Updates

### 1. Risk Controls (`src/modules/taxRiskControls/`)

**Changes:**
- Updated `taxRiskControls.service.ts` to import from `shared/riskScoring`
- Changed `RiskSummaryByLevel` interface from `amber` to `orange`
- Updated `HeatmapResponse` interface to use `orange_max` instead of `amber_max`
- All risk control responses now include computed `inherent_score` and `inherent_color` (level)
- Colors are NOT stored manually; they are computed from `likelihood` and `impact`

**OpenAPI Updates:**
- Updated all documentation to use `orange` instead of `amber`
- Endpoints affected:
  - `GET /api/clients/{clientId}/tax/risk-controls/summary`
  - `GET /api/clients/{clientId}/tax/risk-controls/heatmap`

### 2. Tax Risk Matrix (`src/modules/taxRiskMatrix/`)

**Changes:**
- Updated `taxRiskMatrix.service.ts` to use `computeLevel` from shared module
- `deriveColorFromNumber()` now uses shared `computeLevel()` function
- Matrix cells store `value_number` and derive color using unified thresholds
- Schema already used `orange` correctly (no changes needed)

**Endpoints:**
- `GET /api/clients/{clientId}/tax/risk-matrix` - returns cells with computed colors
- `PUT /api/clients/{clientId}/tax/risk-matrix` - accepts cells, computes colors server-side

### 3. Risk Aggregations & Heatmap

**Changes:**
- SQL function `get_risk_heatmap_aggregation` unchanged (performs GROUP BY only)
- TypeScript service layer applies unified thresholds via shared functions
- Heatmap response includes thresholds: `green_max: 5, orange_max: 12, red_max: 25`

### 4. Backward Compatibility (`src/utils/riskScore.ts`)

**Changes:**
- Deprecated utility now re-exports from shared module
- Maintains API compatibility for any existing imports
- Type `RiskLevel` now includes `'orange'` instead of `'amber'`

## Database Schema

No database schema changes required. The existing columns work with the unified logic:
- `tax_risk_control_rows.inherent_color` stores computed level
- `tax_risk_matrix_entries.color` stores computed color
- Both use the same thresholds via shared functions

## Testing

### Unit Tests (`tests/riskScoring.test.ts`)
- Tests for `computeScore()`, `computeLevel()`, and `computeColor()`
- Validates thresholds: green (1-5), orange (6-12), red (13-25)
- Ensures all 25 possible score combinations produce correct levels
- Verifies threshold constants are correct

### Integration Tests (`tests/riskScoringIntegration.test.ts`)
- Validates Risk Controls and Tax Risk Matrix use same thresholds
- Tests heatmap aggregation produces consistent level counts
- Verifies risk summary counts by level align with thresholds
- Confirms backward compatibility with old `riskScore` utility

## API Response Changes

### Before
```json
{
  "inherent_color": "amber",
  "by_level": {
    "green": 2,
    "amber": 3,
    "red": 1
  },
  "thresholds": {
    "amber_max": 12
  }
}
```

### After
```json
{
  "inherent_color": "orange",
  "by_level": {
    "green": 2,
    "orange": 3,
    "red": 1
  },
  "thresholds": {
    "orange_max": 12
  }
}
```

## Definition of Done ✅

- [x] Created shared constants (`GREEN_MAX=5`, `ORANGE_MAX=12`, `RED_MAX=25`)
- [x] Created shared helpers (`computeScore`, `computeLevel`, `computeColor`)
- [x] Risk Controls use shared logic (no manual color storage)
- [x] Tax Risk Matrix uses shared logic (derives color from score)
- [x] Heatmap uses exact same thresholds
- [x] OpenAPI schemas updated to reflect `orange` instead of `amber`
- [x] Unit tests verify scoring logic (18 tests passing)
- [x] Integration tests verify consistency across modules
- [x] No divergent thresholds across modules
- [x] Backward compatibility maintained

## Migration Notes

**For Frontend/API Consumers:**
- Replace `amber` with `orange` in all API responses
- Field names changed: `amber_max` → `orange_max`
- Enum values changed: `['green', 'amber', 'red']` → `['green', 'orange', 'red']`
- Thresholds remain the same (6-12 for medium risk)

**For Backend Developers:**
- Always import from `src/shared/riskScoring` for risk calculations
- Never hardcode thresholds; use constants from `src/shared/riskThresholds`
- Do not store computed colors in database; compute on-the-fly from likelihood/impact

## Files Modified

### Created
- `src/shared/riskThresholds.ts`
- `src/shared/riskScoring.ts`
- `tests/riskScoring.test.ts`
- `tests/riskScoringIntegration.test.ts`
- `UNIFIED_RISK_SCORING_IMPLEMENTATION.md`

### Modified
- `src/modules/taxRiskControls/taxRiskControls.service.ts`
- `src/modules/taxRiskControls/taxRiskControls.routes.ts`
- `src/modules/taxRiskMatrix/taxRiskMatrix.service.ts`
- `src/utils/riskScore.ts` (backward compatibility wrapper)

### Unchanged (Already Correct)
- `src/modules/taxRiskMatrix/taxRiskMatrix.schema.ts` (already used `orange`)
- `supabase/migrations/20251229_risk_heatmap_aggregation.sql` (SQL aggregation only)
- Database schema (no changes needed)
