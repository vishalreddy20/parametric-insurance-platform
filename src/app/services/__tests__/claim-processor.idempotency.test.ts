import { beforeEach, describe, expect, test } from 'vitest';
import { processClaim } from '../claim-processor';
import { ClaimLocks, Policies, Users } from '../mock-db';
import type { Policy, UserProfile } from '../mock-db';

describe('claim-processor idempotency', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  function seedUserAndPolicy() {
    const user: UserProfile = {
      userId: 'test_user_1',
      email: 'test@example.com',
      name: 'Test User',
      phone: '+919999999999',
      platform: 'zomato',
      vehicleType: 'scooter',
      city: 'Hyderabad',
      state: 'Telangana',
      zone: 'Banjara Hills',
      weeklyIncome: 6000,
      weeklyHours: 50,
      yearsExperience: 2,
      subscriptionTier: 'standard',
      subscriptionStatus: 'active',
      policyId: 'POL_TEST_1',
      weeklyPremium: 400,
      subscriptionStartDate: new Date().toISOString(),
      totalPayouts: 0,
      claimCount: 0,
      weeklyClaimCount: 0,
      riskScore: 0,
      createdAt: new Date().toISOString(),
      lastClaimDate: null,
      onboardingComplete: true,
    };

    const policy: Policy = {
      policyId: 'POL_TEST_1',
      userId: user.userId,
      policyNumber: 'ZS-HYD-000001',
      tier: 'standard',
      status: 'active',
      weeklyPremium: 400,
      coverageAmount: 6000,
      weeklyCap: 1000,
      planFactor: 1,
      startDate: new Date().toISOString(),
      renewalDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      city: 'Hyderabad',
      platform: 'zomato',
      riskFactors: {
        basePremium: 420,
        cityRiskMultiplier: 1.2,
        seasonalMultiplier: 1.0,
        platformMultiplier: 1.0,
        experienceDiscount: 0.94,
        hoursMultiplier: 1.05,
        claimHistoryMultiplier: 1.0,
        finalPremium: 400,
      },
      createdAt: new Date().toISOString(),
    };

    Users.set(user.userId, user);
    Policies.set(policy.policyId, policy);
  }

  test('prevents duplicate claims in the same disruption window', async () => {
    seedUserAndPolicy();

    const first = await processClaim('test_user_1', 17.385, 78.486, 'outage');
    expect(first.status).not.toBe('rejected');

    const second = await processClaim('test_user_1', 17.385, 78.486, 'outage');
    expect(second.status).toBe('rejected');
    expect(second.message.toLowerCase()).toContain('duplicate');

    const locks = ClaimLocks.getAll();
    expect(locks.length).toBeGreaterThan(0);
  });
});
