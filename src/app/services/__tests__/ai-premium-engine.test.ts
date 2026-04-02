import { describe, expect, test } from 'vitest';
import { calculateDynamicPremium, calculatePayout } from '../ai-premium-engine';

describe('ai-premium-engine', () => {
  test('returns weekly premium within guardrails', () => {
    const result = calculateDynamicPremium(
      {
        city: 'Mumbai',
        platform: 'zomato',
        weeklyIncome: 6000,
        weeklyHours: 55,
        yearsExperience: 2,
        claimCount: 1,
      },
      'standard'
    );

    expect(result.basePremium).toBe(420);
    expect(result.finalPremium).toBeGreaterThanOrEqual(15);
    expect(result.finalPremium).toBeLessThanOrEqual(900); // 15% of weekly income
  });

  test('caps payout at tier weekly limit', () => {
    const result = calculatePayout(9000, 40, 12, 'premium');
    expect(result.payout).toBeLessThanOrEqual(1500);
  });

  test('respects minimum payout floor', () => {
    const result = calculatePayout(2000, 80, 1, 'basic');
    expect(result.minimumPayout).toBeGreaterThanOrEqual(50);
    expect(result.payout).toBeGreaterThanOrEqual(50);
  });
});
