import { computeScore, computeLevel, RiskLevel as SharedRiskLevel } from '../shared/riskScoring';

export type RiskLevel = SharedRiskLevel;

export interface RiskScoreResult {
  score: number;
  level: RiskLevel;
}

export function computeRiskScore(likelihood: number | null, impact: number | null): number {
  return computeScore(likelihood, impact);
}

export function computeRiskLevel(score: number): RiskLevel {
  return computeLevel(score);
}

export function computeRiskScoreAndLevel(
  likelihood: number | null,
  impact: number | null
): RiskScoreResult {
  const score = computeScore(likelihood, impact);
  const level = computeLevel(score);
  return { score, level };
}
