# Heatmap Endpoint Upgrade Summary

**Date**: January 13, 2026  
**Ticket**: Upgrade Heatmap Endpoint to Return Full 25 Cells

## Overview

Upgraded the existing heatmap endpoint `GET /api/clients/:clientId/tax/risk-controls/heatmap` to return a high-quality response suitable for client dashboard heatmaps. The endpoint now returns all 25 cells (likelihood 1-5 × impact 1-5) by default with complete scoring information.

## Changes

### 1. Service Layer (`src/modules/taxRiskControls/taxRiskControls.service.ts`)

#### Updated `HeatmapCell` Interface
- **Added**: `score: number` - Computed as `likelihood × impact`
- **Added**: `level: RiskLevel` - Risk level based on score thresholds (green/orange/red)
- **Removed**: `by_level` object - Simplified response structure
- **Kept**: `likelihood`, `impact`, `count_total`

#### Updated `getRiskHeatmap` Function
- **New Parameter**: `compact: boolean = false` - Controls response mode
- **Default Behavior**: Returns all 25 cells (5×5 matrix) with score, level, and count_total
- **Compact Mode**: Returns only cells with `count_total > 0` when `compact=true`
- **Cell Ordering**: Deterministic order - impact DESC (5→1), likelihood ASC (1→5)
- **Merge Logic**: 
  - Builds full 25-cell template server-side
  - Merges RPC results by `(likelihood, impact)` key
  - Sets `count_total = 0` for cells with no data

### 2. Route Handler (`src/modules/taxRiskControls/taxRiskControls.routes.ts`)

#### Updated Route Handler
- **Added Query Param**: `compact` (optional string, case-insensitive)
- **Validation**: Uses express-validator to validate query parameter
- **Behavior**: Treats `compact=true` (case-insensitive) as true, otherwise false
- **Backward Compatible**: Default behavior returns all 25 cells

#### Updated OpenAPI Documentation
- Added `compact` query parameter documentation
- Updated response schema to reflect new cell structure with `score` and `level`
- Added description about cell ordering
- Enhanced documentation with clear examples

### 3. Tests (`tests/riskAggregations.test.ts`)

#### Updated Existing Tests
1. **"should return correct response structure"** → **"should return correct response structure with all 25 cells by default"**
   - Now expects 25 cells instead of variable count
   - Verifies each cell has required properties (likelihood, impact, score, level, count_total)

2. **"should aggregate risks by likelihood and impact"** → **"should merge RPC data into all 25 cells with correct counts"**
   - Tests that all 25 cells are returned
   - Verifies counts are merged correctly from RPC
   - Tests score and level computation

3. **"should correctly classify cell counts by level"** → **"should correctly compute score and level for each cell"**
   - Tests score calculation (likelihood × impact)
   - Verifies level assignment (green/orange/red)

4. **"should only return cells with count_total > 0"** → **"should return only non-zero cells when compact=true"**
   - Tests compact mode functionality
   - Uses query parameter `?compact=true`

#### Added New Tests
1. **"should order cells by impact DESC, likelihood ASC"**
   - Verifies deterministic cell ordering
   - Tests first 5 cells (impact=5, likelihood=1-5)
   - Tests last 5 cells (impact=1, likelihood=1-5)

2. **"should correctly compute level for boundary scores"**
   - Tests boundary values: score 5 (green), 6 (orange), 12 (orange), 16 (red)
   - Ensures correct threshold application

### Test Results
✅ **All 25 tests passed**
- 12 tests for summary endpoint
- 11 tests for heatmap endpoint (including 4 new/updated tests)
- 2 tests for risk scoring consistency

## Response Structure

### Default Response (`compact=false` or not specified)
```json
{
  "data": {
    "cells": [
      { "likelihood": 1, "impact": 5, "score": 5,  "level": "green",  "count_total": 0 },
      { "likelihood": 2, "impact": 5, "score": 10, "level": "orange", "count_total": 0 },
      { "likelihood": 3, "impact": 5, "score": 15, "level": "red",    "count_total": 0 },
      { "likelihood": 4, "impact": 5, "score": 20, "level": "red",    "count_total": 0 },
      { "likelihood": 5, "impact": 5, "score": 25, "level": "red",    "count_total": 0 },
      // ... 20 more cells (impact 4→1)
    ],
    "axes": {
      "likelihood": [1, 2, 3, 4, 5],
      "impact": [1, 2, 3, 4, 5]
    },
    "thresholds": {
      "green_max": 5,
      "orange_max": 12,
      "red_max": 25
    }
  }
}
```

### Compact Response (`compact=true`)
```json
{
  "data": {
    "cells": [
      { "likelihood": 3, "impact": 3, "score": 9,  "level": "orange", "count_total": 2 },
      { "likelihood": 4, "impact": 5, "score": 20, "level": "red",    "count_total": 1 }
    ],
    "axes": { "likelihood": [1,2,3,4,5], "impact": [1,2,3,4,5] },
    "thresholds": { "green_max": 5, "orange_max": 12, "red_max": 25 }
  }
}
```

## Business Rules (Unchanged)

### Scoring Logic
- **likelihood**: integer 1-5
- **impact**: integer 1-5
- **score**: `likelihood × impact` (1-25)

### Level Thresholds
- **green**: score 1-5 (score ≤ 5)
- **orange**: score 6-12 (5 < score ≤ 12)
- **red**: score 13-25 (score > 12)

### Cell Ordering
- **Primary Sort**: impact DESC (5 → 4 → 3 → 2 → 1)
- **Secondary Sort**: likelihood ASC (1 → 2 → 3 → 4 → 5)
- **Result**: First 5 cells are (L1,I5), (L2,I5), (L3,I5), (L4,I5), (L5,I5)

## Backward Compatibility

### Breaking Changes
- **Removed**: `by_level` object from cell structure
- **Changed**: Default behavior now returns 25 cells instead of only non-zero cells

### Migration Path
- Frontend consumers expecting only non-zero cells: Add `?compact=true` query parameter
- Frontend consumers using `by_level`: Remove usage, use `level` field directly
- No database or RPC changes required

## API Usage Examples

### Default Usage (All 25 Cells)
```bash
GET /api/clients/{clientId}/tax/risk-controls/heatmap
Authorization: Bearer {jwt_token}
x-api-key: {api_key}
```

### Compact Mode (Non-Zero Only)
```bash
GET /api/clients/{clientId}/tax/risk-controls/heatmap?compact=true
Authorization: Bearer {jwt_token}
x-api-key: {api_key}
```

## Quality Assurance

✅ No TypeScript errors  
✅ No linting errors  
✅ All tests passing (25/25)  
✅ Consistent error handling and auth checks maintained  
✅ No schema or database changes required  
✅ RPC `get_risk_heatmap_aggregation` remains unchanged

## Files Modified

1. `src/modules/taxRiskControls/taxRiskControls.service.ts`
   - Updated `HeatmapCell` interface
   - Updated `getRiskHeatmap` function

2. `src/modules/taxRiskControls/taxRiskControls.routes.ts`
   - Added `compact` query parameter validation
   - Updated route handler to pass compact flag
   - Updated OpenAPI documentation

3. `tests/riskAggregations.test.ts`
   - Updated 4 existing tests
   - Added 2 new tests
   - All 25 tests passing

## Performance Considerations

- **Default Mode**: Returns 25 cells regardless of data (predictable response size ~2KB)
- **Compact Mode**: Returns only populated cells (variable size, better for sparse data)
- **Template Building**: O(25) = O(1) constant time
- **RPC Merge**: O(n) where n = number of populated cells (typically < 25)
- **No Additional Database Calls**: Uses existing RPC

## Next Steps

1. Update frontend dashboard to consume new response format
2. Consider removing `compact` parameter if not needed after frontend migration
3. Monitor API performance and response sizes in production
4. Update API documentation website if separate from code
