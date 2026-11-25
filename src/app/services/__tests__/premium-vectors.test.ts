import { describe, expect, it } from 'vitest';
import vectors from '../../../../testdata/premium-vectors.json';
import { calculatePayout, TIER_CONFIG } from '../ai-premium-engine';

type Tier = keyof typeof TIER_CONFIG;

describe('shared payout calculation', () => {
  it.each(vectors)('$name', ({ income, minutes, lostHours, tier, amount }) => {
    const result = calculatePayout(income / 100, minutes / 60, lostHours, tier as Tier);
    expect(Math.round(result.payout * 100)).toBe(amount);
  });
});
