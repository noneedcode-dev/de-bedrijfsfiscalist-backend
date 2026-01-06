# Risk Scoring Quick Reference

## Import Statement
```typescript
import { computeScore, computeLevel, computeColor } from '../shared/riskScoring';
import { GREEN_MAX, ORANGE_MAX, RED_MAX } from '../shared/riskThresholds';
```

## Usage Examples

### Calculate Risk Score and Level
```typescript
const likelihood = 3; // 1-5
const impact = 4;     // 1-5

const score = computeScore(likelihood, impact);  // 12
const level = computeLevel(score);               // 'orange'

// Or combine in one call:
const color = computeColor(likelihood, impact);  // 'orange'
```

### Check Thresholds
```typescript
if (score <= GREEN_MAX) {
  // Low risk (1-5)
} else if (score <= ORANGE_MAX) {
  // Medium risk (6-12)
} else {
  // High risk (13-25)
}
```

## Risk Levels

| Score Range | Level    | Color Code |
|-------------|----------|------------|
| 1-5         | green    | Low Risk   |
| 6-12        | orange   | Medium Risk|
| 13-25       | red      | High Risk  |

## Matrix Visualization

```
Impact →
    1    2    3    4    5
L 1 [1]  [2]  [3]  [4]  [5]   GREEN
i 2 [2]  [4]  [6]  [8]  [10]  GREEN/ORANGE
k 3 [3]  [6]  [9]  [12] [15]  ORANGE/RED
e 4 [4]  [8]  [12] [16] [20]  ORANGE/RED
  5 [5]  [10] [15] [20] [25]  RED
```

## Common Patterns

### Risk Control Creation
```typescript
const { score, level } = computeRisk(chance, impact);

const insertData = {
  inherent_likelihood: chance,
  inherent_impact: impact,
  inherent_score: score,
  inherent_color: level,  // Computed, not manual
};
```

### Tax Risk Matrix Cell
```typescript
const color = deriveColorFromNumber(value_number);
// Uses shared computeLevel() internally
```

### Heatmap Aggregation
```typescript
const score = computeScore(likelihood, impact);
const level = computeLevel(score);

// Categorize into by_level buckets
by_level[level] = count_total;
```

## Testing

### Unit Test Example
```typescript
import { computeScore, computeLevel } from '../src/shared/riskScoring';

expect(computeScore(2, 3)).toBe(6);
expect(computeLevel(6)).toBe('orange');
```

### Integration Test Example
```typescript
const riskControl = await createRiskControl(supabase, clientId, {
  chance: 3,
  impact: 4,
  // ... other fields
}, user);

expect(riskControl.inherent_score).toBe(12);
expect(riskControl.inherent_color).toBe('orange');
```

## Do's and Don'ts

### ✅ Do
- Always use shared functions for risk calculations
- Import constants from `riskThresholds.ts`
- Compute colors dynamically from likelihood/impact
- Use `'orange'` for medium risk level

### ❌ Don't
- Hardcode threshold values (5, 12, 25)
- Store colors manually without computing
- Use `'amber'` (deprecated, use `'orange'`)
- Create divergent threshold logic

## API Response Format

```json
{
  "inherent_likelihood": 3,
  "inherent_impact": 4,
  "inherent_score": 12,
  "inherent_color": "orange"
}
```

## Constants Reference

```typescript
GREEN_MAX = 5    // Maximum score for green level
ORANGE_MAX = 12  // Maximum score for orange level
RED_MAX = 25     // Maximum score for red level
```

## Type Definitions

```typescript
type RiskLevel = 'green' | 'orange' | 'red';

interface RiskScore {
  score: number;
  level: RiskLevel;
}
```
