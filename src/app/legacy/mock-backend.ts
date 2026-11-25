/**
 * Mock backend that uses localStorage to simulate the Supabase Edge Function
 * when the Edge Function is not deployed. This allows the full app to work
 * locally for demonstration and testing purposes.
 */

const STORAGE_PREFIX = 'zyrosafe_';

function getKey(key: string): string {
  return `${STORAGE_PREFIX}${key}`;
}

function setItem(key: string, value: any): void {
  localStorage.setItem(getKey(key), JSON.stringify(value));
}

function getItem(key: string): any {
  const raw = localStorage.getItem(getKey(key));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function getByPrefix(prefix: string): any[] {
  const results: any[] = [];
  const fullPrefix = getKey(prefix);
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(fullPrefix)) {
      const raw = localStorage.getItem(key);
      if (raw) {
        try {
          results.push(JSON.parse(raw));
        } catch {
          // skip
        }
      }
    }
  }
  return results;
}

// ==================== Mock API Functions ====================

export function saveUserProfile(userId: string, profileData: {
  email: string;
  name: string;
  phone: string;
  weeklyIncome: number;
  weeklyHours: number;
  city: string;
  state: string;
}): void {
  const userProfile = {
    userId,
    ...profileData,
    subscriptionTier: 'none',
    subscriptionStatus: 'inactive',
    createdAt: new Date().toISOString(),
    totalPayouts: 0,
    claimCount: 0,
    riskScore: 0
  };
  setItem(`user:${userId}`, userProfile);
}

export async function getProfile(userId: string): Promise<{
  profile: any;
  recentPayouts: any[];
}> {
  const profile = getItem(`user:${userId}`);
  const payouts = getByPrefix(`payout:${userId}:`);
  const recentPayouts = payouts.slice(-10).reverse();

  return {
    profile: profile || {
      userId,
      name: 'User',
      email: '',
      weeklyIncome: 0,
      weeklyHours: 0,
      subscriptionTier: 'none',
      subscriptionStatus: 'inactive',
      totalPayouts: 0,
      claimCount: 0,
      riskScore: 0
    },
    recentPayouts
  };
}

export async function subscribe(userId: string, tier: string): Promise<{
  success: boolean;
  tier: string;
  weeklyPremium: number;
  message: string;
  error?: string;
}> {
  if (!['basic', 'standard', 'premium'].includes(tier)) {
    return { success: false, tier, weeklyPremium: 0, message: '', error: 'Invalid subscription tier' };
  }

  const userProfile = getItem(`user:${userId}`);
  if (!userProfile) {
    return { success: false, tier, weeklyPremium: 0, message: '', error: 'User profile not found' };
  }

  const premiumRates: Record<string, number> = { basic: 0.05, standard: 0.07, premium: 0.10 };
  const weeklyPremium = userProfile.weeklyIncome * premiumRates[tier];

  userProfile.subscriptionTier = tier;
  userProfile.subscriptionStatus = 'active';
  userProfile.weeklyPremium = weeklyPremium;
  userProfile.subscriptionStartDate = new Date().toISOString();

  setItem(`user:${userId}`, userProfile);

  return {
    success: true,
    tier,
    weeklyPremium: Math.round(weeklyPremium * 100) / 100,
    message: 'Subscription activated successfully'
  };
}

export async function checkDisruption(userId: string, latitude: number, longitude: number): Promise<any> {
  const userProfile = getItem(`user:${userId}`);
  if (!userProfile || userProfile.subscriptionStatus !== 'active') {
    return { error: 'No active subscription' };
  }

  // Simulate weather disruption check using random logic for demo
  // In production, this would call OpenWeather API
  const weatherTypes = [
    { type: 'heavy_rainfall', severity: 'severe', lostHours: 5, chance: 0.3 },
    { type: 'moderate_rainfall', severity: 'moderate', lostHours: 3, chance: 0.2 },
    { type: 'extreme_heat', severity: 'severe', lostHours: 4, chance: 0.15 },
    { type: 'none', severity: 'none', lostHours: 0, chance: 0.35 }
  ];

  // Use a seeded random based on date so results are consistent within a day
  const today = new Date().toISOString().split('T')[0];
  const seed = today.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) + latitude * 100;
  const rand = (Math.sin(seed) * 10000) % 1;
  const absRand = Math.abs(rand);

  let cumulative = 0;
  let selectedWeather = weatherTypes[weatherTypes.length - 1];
  for (const wt of weatherTypes) {
    cumulative += wt.chance;
    if (absRand < cumulative) {
      selectedWeather = wt;
      break;
    }
  }

  const isDisrupted = selectedWeather.type !== 'none';

  if (!isDisrupted) {
    return {
      disrupted: false,
      message: 'No active disruptions in your area. Current conditions are safe for deliveries.'
    };
  }

  // Calculate payout
  const hourlyIncome = userProfile.weeklyHours > 0 ? userProfile.weeklyIncome / userProfile.weeklyHours : 0;
  const lostHours = selectedWeather.lostHours;
  const planFactors: Record<string, number> = { basic: 0.8, standard: 1.0, premium: 1.2 };
  const planFactor = planFactors[userProfile.subscriptionTier] || 1.0;
  const minimumPayout = Math.max(50, userProfile.weeklyIncome * 0.01);
  const payoutAmount = Math.max(minimumPayout, hourlyIncome * lostHours * planFactor);
  const roundedPayout = Math.round(payoutAmount * 100) / 100;

  // Store payout record
  const payoutId = `payout:${userId}:${Date.now()}`;
  const payoutRecord = {
    userId,
    amount: roundedPayout,
    disruptionType: selectedWeather.type,
    severity: selectedWeather.severity,
    lostHours,
    latitude,
    longitude,
    riskScore: 0,
    status: 'approved',
    timestamp: new Date().toISOString()
  };
  setItem(payoutId, payoutRecord);

  // Update user stats
  userProfile.totalPayouts = (userProfile.totalPayouts || 0) + roundedPayout;
  userProfile.claimCount = (userProfile.claimCount || 0) + 1;
  userProfile.lastClaimDate = new Date().toISOString();
  setItem(`user:${userId}`, userProfile);

  return {
    disrupted: true,
    status: 'approved',
    payout: roundedPayout,
    disruptionType: selectedWeather.type,
    lostHours,
    message: `Payout of ₹${roundedPayout} approved and will be processed shortly`
  };
}

// ==================== Admin Functions ====================

export async function getAdminStats(): Promise<any> {
  const users = getByPrefix('user:');
  const payouts = getByPrefix('payout:');

  const activeUsers = users.filter(u => u.subscriptionStatus === 'active').length;
  const totalPayouts = payouts.reduce((sum, p) => sum + (p.amount || 0), 0);
  const totalPremiums = users.reduce((sum, u) => {
    if (u.subscriptionStatus === 'active') {
      return sum + (u.weeklyPremium || 0);
    }
    return sum;
  }, 0);

  return {
    totalUsers: users.length,
    activeSubscriptions: activeUsers,
    totalPayoutsCount: payouts.length,
    totalPayoutsAmount: Math.round(totalPayouts * 100) / 100,
    weeklyPremiumRevenue: Math.round(totalPremiums * 100) / 100,
    poolBalance: Math.round((totalPremiums * 4 - totalPayouts) * 100) / 100
  };
}

export async function getAdminUsers(): Promise<{ users: any[]; count: number }> {
  const users = getByPrefix('user:');
  return { users, count: users.length };
}

export async function getAdminFlagged(): Promise<{ flagged: any[]; count: number }> {
  const flagged = getByPrefix('flagged:');
  return { flagged, count: flagged.length };
}
