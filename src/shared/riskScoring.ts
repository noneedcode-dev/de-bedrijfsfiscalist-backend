import { GREEN_MAX, ORANGE_MAX } from './riskThresholds';

export type RiskLevel = 'green' | 'orange' | 'red';

export function computeScore(likelihood: number | null, impact: number | null): number {
  if (likelihood === null || impact === null) {
    return 0;
  }
  return likelihood * impact;
}

export function computeLevel(score: number): RiskLevel {
  if (score >= 1 && score <= GREEN_MAX) {
    return 'green';
  } else if (score >= GREEN_MAX + 1 && score <= ORANGE_MAX) {
    return 'orange';
  } else if (score >= ORANGE_MAX + 1) {
    return 'red';
  }
  return 'green';
}

export function computeColor(likelihood: number | null, impact: number | null): RiskLevel {
  const score = computeScore(likelihood, impact);
  return computeLevel(score);
}
