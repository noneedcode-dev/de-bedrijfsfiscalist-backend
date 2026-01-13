# Bubble Heatmap Integration - Quick Start

## Setup in Bubble API Connector

### 1. Configure the API Call

**Endpoint URL:**
```
https://your-api-domain.com/api/clients/[clientId]/tax/risk-controls/heatmap?format=array
```

**Method:** `GET`

**Headers:**
```
x-api-key: your-api-key
Authorization: Bearer [user-jwt-token]
```

### 2. Use Dynamic References in Bubble

With `format=array`, you can now directly access cell properties:

```
body:first item:likelihood      → 1
body:first item:impact          → 5
body:first item:score           → 5
body:first item:level           → "green"
body:first item:count_total     → 0
```

### 3. Display in Repeating Group

**Data source:**
```
Get data from external API → Call: GetHeatmap
```

**Cell references:**
```
Current cell's likelihood    → This cell's likelihood
Current cell's impact        → This cell's impact
Current cell's score         → This cell's score
Current cell's level         → This cell's level
Current cell's count_total   → This cell's count_total
```

## Examples

### Get All 25 Cells
```
GET /api/clients/{clientId}/tax/risk-controls/heatmap?format=array
```
Returns 25 cells (5x5 matrix), including empty cells with `count_total: 0`

### Get Only Non-Zero Cells (Compact Mode)
```
GET /api/clients/{clientId}/tax/risk-controls/heatmap?format=array&compact=true
```
Returns only cells that have risks (`count_total > 0`)

## Cell Properties

Each cell in the array contains:

| Property | Type | Range | Description |
|----------|------|-------|-------------|
| `likelihood` | integer | 1-5 | Likelihood score |
| `impact` | integer | 1-5 | Impact score |
| `score` | integer | 1-25 | likelihood × impact |
| `level` | string | green/orange/red | Risk level |
| `count_total` | integer | ≥0 | Number of risks in this cell |

## Risk Levels

- **Green**: score 1-5 (low risk)
- **Orange**: score 6-12 (medium risk)
- **Red**: score 13-25 (high risk)

## Cell Ordering

Cells are ordered by:
1. **Impact** (descending): 5 → 4 → 3 → 2 → 1
2. **Likelihood** (ascending): 1 → 2 → 3 → 4 → 5

**Example order:**
```
[0]  = likelihood:1, impact:5
[1]  = likelihood:2, impact:5
[2]  = likelihood:3, impact:5
[3]  = likelihood:4, impact:5
[4]  = likelihood:5, impact:5
[5]  = likelihood:1, impact:4
...
[24] = likelihood:5, impact:1
```

## Tips for Bubble

### Color Coding by Level
Use conditional formatting in Bubble:
```
When This cell's level = "green" → Background color: #00FF00
When This cell's level = "orange" → Background color: #FFA500
When This cell's level = "red" → Background color: #FF0000
```

### Filter Empty Cells
Use Bubble's `:filtered` operator:
```
Get data from API:filtered (This cell's count_total > 0)
```

Or use the API's built-in compact mode:
```
GET .../heatmap?format=array&compact=true
```

### Display Cell Label
Combine likelihood and impact:
```
Text: "L[This cell's likelihood] × I[This cell's impact]"
Result: "L3 × I4"
```

### Show Risk Count Badge
```
Text: This cell's count_total
Conditional: Only visible when This cell's count_total > 0
```

## Comparison: Old vs New Format

### Old Format (Default)
```json
{
  "data": {
    "cells": [...],
    "axes": {...},
    "thresholds": {...}
  }
}
```
**Bubble reference:** `body:data:cells:first item:likelihood` ❌ Complex

### New Format (format=array)
```json
[
  { "likelihood": 1, "impact": 5, ... },
  { "likelihood": 2, "impact": 5, ... }
]
```
**Bubble reference:** `body:first item:likelihood` ✅ Simple

## Backward Compatibility

The default behavior (without `format` parameter) remains unchanged:
- Old integrations continue to work
- Use `format=array` only for new Bubble integrations
- Both formats return the same data, just structured differently
