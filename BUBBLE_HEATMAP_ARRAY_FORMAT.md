# Bubble-Friendly Heatmap Array Format Implementation

**Date**: January 13, 2026  
**Feature**: Add `format=array` query parameter for Bubble API Connector compatibility

## Overview

Added an optional `format=array` query parameter to the heatmap endpoint that returns cells as a direct JSON array instead of wrapping them in an object structure. This allows Bubble API Connector to access cell properties directly using `body:first item:likelihood` syntax instead of `body:data:cells:first item:likelihood`.

## Changes

### 1. Route Handler (`src/modules/taxRiskControls/taxRiskControls.routes.ts`)

#### Added Query Parameter Validation
```typescript
query('format').optional().isString().withMessage('format must be a string'),
```

#### Added Format Logic
```typescript
const formatParam = req.query.format as string | undefined;
const format = typeof formatParam === 'string' ? formatParam.toLowerCase() : 'object';
const isArray = format === 'array';
```

#### Updated Response Logic
```typescript
if (isArray) {
  res.json(data.cells);
} else {
  res.json({ data });
}
```

### 2. OpenAPI Documentation

Updated endpoint documentation to include:
- New `format` query parameter with enum values: `[object, array]`
- Enhanced description explaining Bubble compatibility
- Added `oneOf` schema to document both response formats:
  - **Object format** (default): `{ data: { cells, axes, thresholds } }`
  - **Array format** (format=array): `[{ likelihood, impact, score, level, count_total }, ...]`

### 3. Tests (`tests/riskAggregations.test.ts`)

Added 6 comprehensive tests:

1. **`format=array` returns array**: Verifies response is a direct array with 25 cells
2. **`format=array&compact=true`**: Verifies compact mode works with array format
3. **Default object format**: Verifies backward compatibility when format not specified
4. **`format=object`**: Verifies explicit object format request
5. **Case insensitive**: Verifies `format=ARRAY` works (case-insensitive)
6. **All existing tests pass**: Ensures no regression

## API Usage

### Default Object Response (Backward Compatible)
```bash
GET /api/clients/{clientId}/tax/risk-controls/heatmap
```

**Response:**
```json
{
  "data": {
    "cells": [
      { "likelihood": 1, "impact": 5, "score": 5, "level": "green", "count_total": 0 },
      ...
    ],
    "axes": { "likelihood": [1,2,3,4,5], "impact": [1,2,3,4,5] },
    "thresholds": { "green_max": 5, "orange_max": 12, "red_max": 25 }
  }
}
```

### Bubble-Friendly Array Response
```bash
GET /api/clients/{clientId}/tax/risk-controls/heatmap?format=array
```

**Response:**
```json
[
  { "likelihood": 1, "impact": 5, "score": 5, "level": "green", "count_total": 0 },
  { "likelihood": 2, "impact": 5, "score": 10, "level": "orange", "count_total": 0 },
  ...
]
```

**Bubble API Connector Setup:**
- Can now reference: `body:first item:likelihood` ✅
- Instead of: `body:data:cells:first item:likelihood` ❌

### Array Format with Compact Mode
```bash
GET /api/clients/{clientId}/tax/risk-controls/heatmap?format=array&compact=true
```

Returns only cells with `count_total > 0` as a direct array.

## Feature Behavior

| Query Parameter | Response Format | Description |
|----------------|-----------------|-------------|
| (none) | Object | Default: `{ data: { cells, axes, thresholds } }` |
| `format=object` | Object | Explicit object format |
| `format=array` | Array | Direct cells array: `[cell, cell, ...]` |
| `format=array&compact=true` | Array | Only non-zero cells as array |

- **Case Insensitive**: `format=ARRAY`, `format=Array`, `format=array` all work
- **Ordering**: Same deterministic order (impact DESC, likelihood ASC)
- **Cell Properties**: Same structure regardless of format
- **Backward Compatible**: Default behavior unchanged

## Service Layer

No changes to `taxRiskControls.service.ts`. The service continues to return the full `HeatmapResponse` object with cells, axes, and thresholds. The format transformation happens at the controller level.

## Testing Results

✅ All 30 tests passing:
- 24 existing tests (backward compatibility)
- 6 new tests for array format functionality

```
✓ tests/riskAggregations.test.ts (30 tests) 77ms

Test Files  1 passed (1)
     Tests  30 passed (30)
```

## Impact

- ✅ No breaking changes
- ✅ Backward compatible
- ✅ Enables Bubble API Connector integration
- ✅ Maintains all existing functionality (compact mode, client isolation, scoring, etc.)
- ✅ Full test coverage
- ✅ OpenAPI documentation updated
