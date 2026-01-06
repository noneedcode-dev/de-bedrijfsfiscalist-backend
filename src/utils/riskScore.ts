export type RiskLevel = 'green' | 'amber' | 'red';

export interface RiskScoreResult {
  score: number;
  level: RiskLevel;
}

export function computeRiskScore(likelihood: number | null, impact: number | null): number {
  if (likelihood === null || impact === null) {
    return 0;
  }
  return likelihood * impact;
}

export function computeRiskLevel(score: number): RiskLevel {
  if (score >= 13) {
    return 'red';
  } else if (score >= 6) {
    return 'amber';
  }
  return 'green';
}

export function computeRiskScoreAndLevel(
  likelihood: number | null,
  impact: number | null
): RiskScoreResult {
  const score = computeRiskScore(likelihood, impact);
  const level = computeRiskLevel(score);
  return { score, level };
}
