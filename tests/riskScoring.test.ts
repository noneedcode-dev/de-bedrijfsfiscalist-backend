import { describe, it, expect } from 'vitest';
import { computeScore, computeLevel, computeColor } from '../src/shared/riskScoring';
import { GREEN_MAX, ORANGE_MAX, RED_MAX } from '../src/shared/riskThresholds';

describe('Risk Scoring - Shared Logic', () => {
  describe('computeScore', () => {
    it('should compute score as likelihood * impact', () => {
      expect(computeScore(1, 1)).toBe(1);
      expect(computeScore(2, 3)).toBe(6);
      expect(computeScore(5, 5)).toBe(25);
    });

    it('should return 0 for null likelihood', () => {
      expect(computeScore(null, 3)).toBe(0);
    });

    it('should return 0 for null impact', () => {
      expect(computeScore(3, null)).toBe(0);
    });

    it('should return 0 for both null', () => {
      expect(computeScore(null, null)).toBe(0);
    });
  });

  describe('computeLevel', () => {
    it('should return green for scores 1-5', () => {
      expect(computeLevel(1)).toBe('green');
      expect(computeLevel(2)).toBe('green');
      expect(computeLevel(3)).toBe('green');
      expect(computeLevel(4)).toBe('green');
      expect(computeLevel(5)).toBe('green');
    });

    it('should return orange for scores 6-12', () => {
      expect(computeLevel(6)).toBe('orange');
      expect(computeLevel(7)).toBe('orange');
      expect(computeLevel(8)).toBe('orange');
      expect(computeLevel(9)).toBe('orange');
      expect(computeLevel(10)).toBe('orange');
      expect(computeLevel(11)).toBe('orange');
      expect(computeLevel(12)).toBe('orange');
    });

    it('should return red for scores 13-25', () => {
      expect(computeLevel(13)).toBe('red');
      expect(computeLevel(14)).toBe('red');
      expect(computeLevel(15)).toBe('red');
      expect(computeLevel(20)).toBe('red');
      expect(computeLevel(25)).toBe('red');
    });

    it('should return green for score 0', () => {
      expect(computeLevel(0)).toBe('green');
    });

    it('should use correct threshold constants', () => {
      expect(GREEN_MAX).toBe(5);
      expect(ORANGE_MAX).toBe(12);
      expect(RED_MAX).toBe(25);
    });

    it('should match thresholds exactly at boundaries', () => {
      expect(computeLevel(GREEN_MAX)).toBe('green');
      expect(computeLevel(GREEN_MAX + 1)).toBe('orange');
      expect(computeLevel(ORANGE_MAX)).toBe('orange');
      expect(computeLevel(ORANGE_MAX + 1)).toBe('red');
    });
  });

  describe('computeColor', () => {
    it('should return green for low risk (1*1)', () => {
      expect(computeColor(1, 1)).toBe('green');
    });

    it('should return orange for medium risk (2*3)', () => {
      expect(computeColor(2, 3)).toBe('orange');
    });

    it('should return red for high risk (5*5)', () => {
      expect(computeColor(5, 5)).toBe('red');
    });

    it('should return green for null inputs', () => {
      expect(computeColor(null, 3)).toBe('green');
      expect(computeColor(3, null)).toBe('green');
      expect(computeColor(null, null)).toBe('green');
    });

    it('should match computeLevel(computeScore(l, i))', () => {
      const testCases = [
        [1, 1], [1, 5], [2, 3], [3, 4], [4, 4], [5, 5]
      ];
      
      testCases.forEach(([likelihood, impact]) => {
        const score = computeScore(likelihood, impact);
        const expectedLevel = computeLevel(score);
        const actualColor = computeColor(likelihood, impact);
        expect(actualColor).toBe(expectedLevel);
      });
    });
  });

  describe('Threshold Consistency', () => {
    it('should have non-overlapping thresholds', () => {
      expect(GREEN_MAX).toBeLessThan(ORANGE_MAX);
      expect(ORANGE_MAX).toBeLessThan(RED_MAX);
    });

    it('should cover all possible scores 1-25', () => {
      for (let score = 1; score <= 25; score++) {
        const level = computeLevel(score);
        expect(['green', 'orange', 'red']).toContain(level);
      }
    });

    it('should produce consistent results for all likelihood*impact combinations', () => {
      for (let likelihood = 1; likelihood <= 5; likelihood++) {
        for (let impact = 1; impact <= 5; impact++) {
          const score = computeScore(likelihood, impact);
          const level = computeLevel(score);
          const color = computeColor(likelihood, impact);
          
          expect(color).toBe(level);
          
          if (score >= 1 && score <= GREEN_MAX) {
            expect(level).toBe('green');
          } else if (score >= GREEN_MAX + 1 && score <= ORANGE_MAX) {
            expect(level).toBe('orange');
          } else if (score >= ORANGE_MAX + 1) {
            expect(level).toBe('red');
          }
        }
      }
    });
  });
});
