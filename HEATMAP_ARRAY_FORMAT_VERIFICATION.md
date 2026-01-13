# Heatmap Array Format Verification

**Date**: January 13, 2026  
**Status**: ✅ VERIFIED - Pure JSON array is returned at root level

## Summary

The heatmap endpoint with `format=array` parameter **correctly returns a pure JSON array at the root level** with NO wrapper objects. This has been verified through comprehensive testing.

## The Issue (User Concern)

User reported that in Bubble API Connector, they see:
```
{ body: [ ... ], headers: { ... } }
```

And cannot access fields directly as `body:first item:likelihood`.

## Root Cause Analysis

The structure `{ body: [...], headers: {...} }` is **Bubble's internal representation** of the HTTP response, NOT what our server sends.

- `body` = The actual JSON response body from our server
- `headers` = HTTP headers

Our server correctly sends a pure JSON array: `[{...}, {...}, ...]`

Bubble wraps this in its internal structure for display purposes.

## Verification Steps Taken

### 1. Code Review ✅

**File**: `src/modules/taxRiskControls/taxRiskControls.routes.ts` (lines 596-608)

```typescript
const heatmap = await taxRiskControlsService.getRiskHeatmap(supabase, clientId, compact);

if (isArray) {
  // Send cells array directly - NO wrapper object
  return res.status(200).json(heatmap.cells);
} else {
  // Default: wrap in data object for backward compatibility
  return res.status(200).json({ data: heatmap });
}
```

**Confirmed**: 
- When `format=array`, we call `res.json(heatmap.cells)`
- `heatmap.cells` is an array: `HeatmapCell[]`
- Express's `res.json()` sends this as a pure JSON array
- NO wrapper objects are added

### 2. Test Suite ✅

**File**: `tests/riskAggregations.test.ts`

**31 tests passing**, including:

#### Test 1: Pure Array Verification
```typescript
expect(Array.isArray(res.body)).toBe(true);
expect(res.body).not.toHaveProperty('data');
expect(res.body).not.toHaveProperty('body');
expect(res.body).not.toHaveProperty('cells');
```

#### Test 2: Bubble API Connector Simulation
```typescript
// Simulate Bubble's access pattern: body:first item:likelihood
const body = res.body;
const firstItem = body[0];
const likelihood = firstItem.likelihood;

expect(likelihood).toBeDefined();
expect(typeof likelihood).toBe('number');

// Verify NO double nesting
expect((body as any).body).toBeUndefined();
expect((body as any).data).toBeUndefined();
```

**All assertions pass** ✅

### 3. Middleware Review ✅

Reviewed all middleware in `src/middleware/`:
- `errorHandler.ts` - Only handles errors, doesn't wrap successful responses
- `requestLogger.ts` - Only logs, doesn't modify responses
- `requestId.ts` - Only adds headers, doesn't modify body
- `apiKey.ts` - Only validates, doesn't modify responses
- `clientAccess.ts` - Only validates, doesn't modify responses

**Confirmed**: NO middleware wraps successful responses in additional objects

### 4. Response Format Examples

#### format=array (Pure Array)
```json
[
  { "likelihood": 1, "impact": 5, "score": 5, "level": "green", "count_total": 0 },
  { "likelihood": 2, "impact": 5, "score": 10, "level": "orange", "count_total": 0 },
  ...
]
```

#### format=object (Default, Wrapped)
```json
{
  "data": {
    "cells": [...],
    "axes": {...},
    "thresholds": {...}
  }
}
```

## Bubble API Connector Usage

### Correct Usage ✅

```
URL: GET /api/clients/{clientId}/tax/risk-controls/heatmap?format=array

Access Pattern in Bubble:
- body:first item:likelihood → res.body[0].likelihood
- body:first item:impact → res.body[0].impact
- body:first item:score → res.body[0].score
- body:first item:count_total → res.body[0].count_total
```

### Why Bubble Shows `{ body: [...], headers: {...} }`

This is Bubble's **internal representation** of the HTTP response structure:
- `body` = Our JSON response (the pure array)
- `headers` = HTTP headers (Content-Type, etc.)

To access the array data, use Bubble's path syntax: `body:first item:field`

This translates to: `response.body[0].field`

## Compact Mode

Works with array format:

```
GET /api/clients/{clientId}/tax/risk-controls/heatmap?format=array&compact=true
```

Returns only cells where `count_total > 0` as a pure array.

## HTTP Response Structure

```
HTTP/1.1 200 OK
Content-Type: application/json
X-Request-ID: <uuid>

[
  { "likelihood": 1, "impact": 5, "score": 5, "level": "green", "count_total": 0 },
  ...
]
```

The HTTP **body** contains ONLY the JSON array, nothing else.

## Conclusion

✅ **VERIFIED**: The server correctly returns a pure JSON array at root level when `format=array` is specified.

✅ **NO WRAPPER**: No `{ data: ... }`, `{ body: ... }`, or `{ cells: ... }` wrapper exists.

✅ **BUBBLE COMPATIBLE**: Can access fields as `body:first item:field` in Bubble API Connector.

✅ **TESTS PASSING**: 31 comprehensive tests verify this behavior.

## If Issues Persist in Bubble

If Bubble still shows nested access patterns like `body:body:first item:likelihood`, possible causes:

1. **Wrong endpoint URL**: Ensure `?format=array` parameter is included
2. **Cached response**: Reinitialize the API call in Bubble API Connector
3. **Wrong data type**: Ensure Bubble interprets as JSON, not text
4. **API Connector configuration**: Verify "Data type" is set to JSON

## Test Command

```bash
npm test -- riskAggregations.test.ts
```

All 31 tests pass ✅
