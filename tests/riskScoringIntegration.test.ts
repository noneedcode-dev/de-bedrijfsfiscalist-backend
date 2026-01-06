import { describe, it, expect, beforeAll, vi } from 'vitest';
import { computeScore, computeLevel } from '../src/shared/riskScoring';

// Mock Supabase client for integration tests
const createMockSupabase = vi.hoisted(() => () => {
  let riskControlCounter = 0;
  const mockRiskControls: any[] = [];
  
  return {
    from: (table: string) => ({
      insert: (data: any) => ({
        select: () => ({
          single: async () => {
            if (table === 'clients') {
              return { data: { id: 'test-client-id' }, error: null };
            }
            if (table === 'app_users') {
              return { data: { id: 'test-user-id' }, error: null };
            }
            if (table === 'tax_function_rows') {
              return { data: { id: 'test-process-id' }, error: null };
            }
            if (table === 'tax_risk_control_rows') {
              const id = `risk-control-${riskControlCounter++}`;
              const control = { ...data, id };
              mockRiskControls.push(control);
              return { data: control, error: null };
            }
            return { data: null, error: null };
          },
        }),
      }),
      delete: () => ({
        eq: () => Promise.resolve({ error: null }),
      }),
      select: () => ({
        eq: () => Promise.resolve({ data: mockRiskControls, error: null }),
      }),
    }),
  };
});

vi.mock('../src/lib/supabaseClient', () => ({
  createSupabaseAdminClient: createMockSupabase,
}));

describe('Risk Scoring Integration - Unified Logic Across Modules', () => {
  const testClientId = 'test-client-id';
  const testUserId = 'test-user-id';
  const testProcessId = 'test-process-id';

  beforeAll(async () => {
    // Mock setup is handled by vi.mock above
  });

  describe('Risk Controls and Tax Risk Matrix Consistency', () => {
    it('should produce same level/color for same likelihood and impact', () => {
      const testCases = [
        { likelihood: 1, impact: 1, expectedLevel: 'green' },
        { likelihood: 2, impact: 3, expectedLevel: 'orange' },
        { likelihood: 5, impact: 5, expectedLevel: 'red' },
        { likelihood: 1, impact: 5, expectedLevel: 'green' },
        { likelihood: 3, impact: 4, expectedLevel: 'orange' },
      ];

      for (const testCase of testCases) {
        const score = computeScore(testCase.likelihood, testCase.impact);
        const level = computeLevel(score);

        expect(level).toBe(testCase.expectedLevel);
      }
    });

    it('should produce same color for same score value', () => {
      const testCases = [
        { value: 1, expectedColor: 'green' },
        { value: 5, expectedColor: 'green' },
        { value: 6, expectedColor: 'orange' },
        { value: 12, expectedColor: 'orange' },
        { value: 13, expectedColor: 'red' },
        { value: 25, expectedColor: 'red' },
      ];

      for (const testCase of testCases) {
        const level = computeLevel(testCase.value);
        expect(level).toBe(testCase.expectedColor);
      }
    });

    it('should ensure consistent thresholds for all likelihood×impact combinations', () => {
      for (let likelihood = 1; likelihood <= 5; likelihood++) {
        for (let impact = 1; impact <= 5; impact++) {
          const score = computeScore(likelihood, impact);
          const level = computeLevel(score);

          // Verify level matches expected threshold
          if (score >= 1 && score <= 5) {
            expect(level).toBe('green');
          } else if (score >= 6 && score <= 12) {
            expect(level).toBe('orange');
          } else if (score >= 13 && score <= 25) {
            expect(level).toBe('red');
          }
        }
      }
    });
  });

  describe('Threshold Consistency', () => {
    it('should use consistent thresholds across modules', () => {
      // Verify thresholds are correct
      const GREEN_MAX = 5;
      const ORANGE_MAX = 12;
      const RED_MAX = 25;

      // Test boundary values
      expect(computeLevel(1)).toBe('green');
      expect(computeLevel(5)).toBe('green');
      expect(computeLevel(6)).toBe('orange');
      expect(computeLevel(12)).toBe('orange');
      expect(computeLevel(13)).toBe('red');
      expect(computeLevel(25)).toBe('red');
    });
  });

  describe('Score Calculation Consistency', () => {
    it('should calculate scores consistently', () => {
      const testCases = [
        { likelihood: 1, impact: 1, expectedScore: 1, expectedLevel: 'green' },
        { likelihood: 1, impact: 2, expectedScore: 2, expectedLevel: 'green' },
        { likelihood: 2, impact: 3, expectedScore: 6, expectedLevel: 'orange' },
        { likelihood: 3, impact: 4, expectedScore: 12, expectedLevel: 'orange' },
        { likelihood: 5, impact: 5, expectedScore: 25, expectedLevel: 'red' },
      ];

      for (const testCase of testCases) {
        const score = computeScore(testCase.likelihood, testCase.impact);
        const level = computeLevel(score);

        expect(score).toBe(testCase.expectedScore);
        expect(level).toBe(testCase.expectedLevel);
      }
    });
  });

  describe('Backward Compatibility', () => {
    it('should maintain compatibility with old riskScore utility', async () => {
      const { computeRiskScore, computeRiskLevel } = await import('../src/utils/riskScore');

      const testCases = [
        { likelihood: 1, impact: 1 },
        { likelihood: 2, impact: 3 },
        { likelihood: 5, impact: 5 },
      ];

      for (const testCase of testCases) {
        const oldScore = computeRiskScore(testCase.likelihood, testCase.impact);
        const newScore = computeScore(testCase.likelihood, testCase.impact);
        expect(oldScore).toBe(newScore);

        const oldLevel = computeRiskLevel(oldScore);
        const newLevel = computeLevel(newScore);
        expect(oldLevel).toBe(newLevel);
      }
    });
  });
});
